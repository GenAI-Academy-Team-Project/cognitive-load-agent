// Appended to the generated AppDelegate.swift by prepare-ios.mjs so Xcode includes it.
// CARESTEAD_NATIVE_ADAPTER_BEGIN
import Capacitor
import Speech
import AVFoundation

@objc(CaresteadViewController)
class CaresteadViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CaresteadAPI())
    }
}

@objc(CaresteadAPI)
public class CaresteadAPI: CAPPlugin, CAPBridgedPlugin, URLSessionTaskDelegate, AVSpeechSynthesizerDelegate {
    public let identifier = "CaresteadAPI"
    public let jsName = "CaresteadAPI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "listen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "silence", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openWeb", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareExport", returnType: CAPPluginReturnPromise)
    ]
    // Playback changes the audio route/format. Never reuse its old input graph.
    private var audioEngine: AVAudioEngine?
    private let synthesizer = AVSpeechSynthesizer()
    private var spokenUtterance: AVSpeechUtterance?
    private var speechRecognizer: SFSpeechRecognizer?
    private var finishingSpeech = false
    private var speechTask: SFSpeechRecognitionTask?
    private var speechRequest: SFSpeechAudioBufferRecognitionRequest?
    private var speechCall: CAPPluginCall?
    private var speechTimer: Timer?
    private var speechText = ""
    private var tapInstalled = false

    public override func load() {
        synthesizer.delegate = self
        NotificationCenter.default.addObserver(self, selector: #selector(pauseVoice), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(audioInterrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    }
    @objc private func audioInterrupted(_ notification: Notification) {
        guard let value = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: value) == .began else { return }
        pauseVoice()
    }
    @objc private func pauseVoice() {
        DispatchQueue.main.async {
            self.finishSpeech("Listening interrupted.")
            self.spokenUtterance = nil
            self.synthesizer.stopSpeaking(at: .immediate)
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        guard spokenUtterance === utterance else { return }
        spokenUtterance = nil
        if speechCall == nil { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
    }

    private func stopSpeechInput() {
        audioEngine?.stop()
        if tapInstalled { audioEngine?.inputNode.removeTap(onBus: 0); tapInstalled = false }
        audioEngine = nil
    }

    private func speechFailureMessage(_ error: Error) -> String {
        let nativeError = error as NSError
        // Keep the underlying failure visible in Xcode without logging care speech.
        NSLog("Carestead speech recognition failed: domain=%@ code=%ld locale=%@",
              nativeError.domain, nativeError.code, speechRecognizer?.locale.identifier ?? "unknown")
        #if targetEnvironment(simulator)
        return "Speech recognition failed in the Xcode simulator. Test Talk on a physical iPhone, or choose Type instead to continue."
        #else
        return "Speech recognition interrupted. Please try again."
        #endif
    }

    // Stop supplying audio first, then give Speech time to deliver its final result.
    // Explicit cancellation still discards everything immediately via finishSpeech.
    private func endSpeechInput() {
        guard let call = speechCall, !finishingSpeech else { return }
        finishingSpeech = true
        speechTimer?.invalidate()
        stopSpeechInput()
        speechRequest?.endAudio()
        speechTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { _ in
            if self.speechCall === call { self.finishSpeech() }
        }
    }

    private func finishSpeech(_ error: String? = nil) {
        guard let call = speechCall else { return }
        speechCall = nil
        speechTimer?.invalidate()
        speechTimer = nil
        stopSpeechInput()
        if !finishingSpeech { speechRequest?.endAudio() }
        if speechTask?.state != .completed { speechTask?.cancel() }
        speechTask = nil
        speechRequest = nil
        speechRecognizer = nil
        finishingSpeech = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        if let error = error { call.reject(error) }
        else if speechText.isEmpty { call.reject("No speech heard. Please try again.") }
        else { call.resolve(["text": speechText]) }
        speechText = ""
    }

    @objc func listen(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.speechCall == nil else { call.reject("Already listening."); return }
            self.speechCall = call
            self.spokenUtterance = nil
            self.synthesizer.stopSpeaking(at: .immediate)
            SFSpeechRecognizer.requestAuthorization { status in
                AVAudioSession.sharedInstance().requestRecordPermission { granted in
                    DispatchQueue.main.async {
                        guard self.speechCall === call else { return }
                        guard status == .authorized && granted else {
                            self.finishSpeech("Enable microphone and speech recognition for Carestead in Settings."); return
                        }
                        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-CA")), recognizer.isAvailable else {
                            self.finishSpeech("Speech recognition is unavailable. Check your connection."); return
                        }
                        do {
                            let session = AVAudioSession.sharedInstance()
                            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
                            try session.setActive(true, options: .notifyOthersOnDeactivation)
                            self.speechRecognizer = recognizer
                            let request = SFSpeechAudioBufferRecognitionRequest()
                            request.shouldReportPartialResults = true
                            self.speechRequest = request
                            let audioEngine = AVAudioEngine()
                            self.audioEngine = audioEngine
                            let input = audioEngine.inputNode
                            let format = input.outputFormat(forBus: 0)
                            guard format.sampleRate > 0 && format.channelCount > 0 else {
                                self.finishSpeech("Microphone unavailable."); return
                            }
                            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
                            self.tapInstalled = true
                            self.speechTask = recognizer.recognitionTask(with: request) { result, error in
                                DispatchQueue.main.async {
                                    guard self.speechCall === call else { return }
                                    if let result = result {
                                        let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
                                        if !text.isEmpty { self.speechText = text }
                                        if result.isFinal { self.finishSpeech(); return }
                                        if !self.finishingSpeech && !text.isEmpty {
                                            self.speechTimer?.invalidate()
                                            self.speechTimer = Timer.scheduledTimer(withTimeInterval: 1.8, repeats: false) { _ in
                                                if self.speechCall === call { self.endSpeechInput() }
                                            }
                                        }
                                    }
                                    if let error = error {
                                        let message = self.speechFailureMessage(error)
                                        self.finishSpeech(self.finishingSpeech && !self.speechText.isEmpty ? nil : message)
                                    }
                                }
                            }
                            audioEngine.prepare()
                            try audioEngine.start()
                            self.speechTimer = Timer.scheduledTimer(withTimeInterval: 20, repeats: false) { _ in
                                if self.speechCall === call { self.endSpeechInput() }
                            }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
                                if self.speechCall === call { self.endSpeechInput() }
                            }
                        } catch { self.finishSpeech("Unable to start the microphone. Please try again.") }
                    }
                }
            }
        }
    }
    @objc func stopListening(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.finishSpeech("Listening stopped."); call.resolve() }
    }
    @objc func speak(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.speechCall == nil else { call.reject("Microphone is active."); return }
            self.spokenUtterance = nil
            self.synthesizer.stopSpeaking(at: .immediate)
            do {
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: .duckOthers)
                try AVAudioSession.sharedInstance().setActive(true)
                let utterance = AVSpeechUtterance(string: call.getString("text") ?? "")
                utterance.voice = AVSpeechSynthesisVoice(language: "en-CA")
                self.spokenUtterance = utterance
                self.synthesizer.speak(utterance)
                call.resolve()
            } catch { call.reject("Spoken reply unavailable.") }
        }
    }
    @objc func silence(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.spokenUtterance = nil
            self.synthesizer.stopSpeaking(at: .immediate)
            if self.speechCall == nil { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
            call.resolve()
        }
    }

    private let allowedPaths: Set<String> = [
        "/api/auth/session", "/api/auth/sign-in", "/api/auth/sign-up", "/api/auth/sign-out", "/api/auth/guest",
        "/api/state", "/api/chat", "/api/calendar",
        "/api/auth/update-profile", "/api/auth/update-password", "/api/auth/forgot-password", "/api/auth/reset-password", "/api/planning", "/api/agent-workflows", "/api/handover", "/api/notifications", "/api/integrations", "/api/export"
    ]
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 25
        configuration.timeoutIntervalForResource = 40
        return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }()

    private func target(_ path: String) -> URL? {
        guard let origin = getConfig().getString("origin"),
              let base = URL(string: origin), base.scheme == "https",
              base.host != nil, base.user == nil, base.password == nil,
              path.hasPrefix("/"), !path.hasPrefix("//"), !path.contains("\\"),
              let url = URL(string: path, relativeTo: base)?.absoluteURL,
              url.scheme == base.scheme, url.host == base.host, url.port == base.port,
              url.user == nil, url.password == nil, url.fragment == nil else { return nil }
        return url
    }

    @objc func request(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), let url = target(path),
              allowedPaths.contains(url.path),
              let method = call.getString("method"), ["GET", "POST"].contains(method) else {
            call.reject("Unsupported Carestead request.")
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // Native requests have no browser origin. Supply the configured site's origin to
        // retain the existing API contract; cookies still determine identity and access.
        request.setValue(getConfig().getString("origin"), forHTTPHeaderField: "Origin")
        if method == "POST", let body = call.getString("body") {
            if call.getString("bodyEncoding") == "base64" {
                guard url.path == "/api/agent-workflows",
                      let contentType = call.getString("contentType"),
                      contentType.hasPrefix("multipart/form-data; boundary="),
                      !contentType.contains("\r"), !contentType.contains("\n"),
                      let data = Data(base64Encoded: body), data.count <= 6 * 1024 * 1024 else {
                    call.reject("Invalid document upload.")
                    return
                }
                request.setValue(contentType, forHTTPHeaderField: "Content-Type")
                request.httpBody = data
            } else {
                guard let data = body.data(using: .utf8), data.count <= 262144,
                      (try? JSONSerialization.jsonObject(with: data)) != nil || body.isEmpty else {
                    call.reject("Invalid request body.")
                    return
                }
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = data
            }
        }

        session.dataTask(with: request) { data, response, error in
            guard error == nil, let response = response as? HTTPURLResponse else {
                call.reject("Unable to reach Carestead. Refresh to check the outcome before retrying a change.")
                return
            }
            guard !(300..<400).contains(response.statusCode) else {
                call.reject("The Carestead API redirected the request. Check the configured backend address.")
                return
            }
            guard let data = data, let text = String(data: data, encoding: .utf8),
                  (try? JSONSerialization.jsonObject(with: data)) != nil else {
                call.reject("Carestead returned an unexpected response.")
                return
            }
            // URLSession owns the cookie jar. Never return Set-Cookie or cookie values to JS.
            call.resolve(["status": response.statusCode, "data": text])
        }.resume()
    }

    @objc func shareExport(_ call: CAPPluginCall) {
        guard let text = call.getString("data"), let data = text.data(using: .utf8),
              (try? JSONSerialization.jsonObject(with: data)) != nil,
              let filename = call.getString("filename"),
              filename.range(of: "^[a-z0-9-]+-carestead-export\\.json$", options: .regularExpression) != nil else {
            call.reject("Invalid care export.")
            return
        }
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController, controller.presentedViewController == nil else {
                call.reject("Close the current sheet and try exporting again.")
                return
            }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let file = directory.appendingPathComponent(filename)
                try data.write(to: file, options: [.atomic, .completeFileProtection])
                let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                sheet.popoverPresentationController?.sourceView = controller.view
                sheet.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 0, height: 0)
                sheet.completionWithItemsHandler = { _, completed, _, error in
                    try? FileManager.default.removeItem(at: directory)
                    if let error = error { call.reject(error.localizedDescription) }
                    else if completed { call.resolve() }
                    else { call.reject("Export sharing cancelled.") }
                }
                controller.present(sheet, animated: true)
            } catch {
                try? FileManager.default.removeItem(at: directory)
                call.reject("Unable to prepare the care export.")
            }
        }
    }

    @objc func openWeb(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), let url = target(path),
              ["/", "/sign-in", "/sign-up"].contains(url.path) else {
            call.reject("Only the Carestead website can be opened.")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() } else { call.reject("Unable to open your browser.") }
            }
        }
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask,
                           willPerformHTTPRedirection response: HTTPURLResponse,
                           newRequest request: URLRequest,
                           completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
// CARESTEAD_NATIVE_ADAPTER_END
