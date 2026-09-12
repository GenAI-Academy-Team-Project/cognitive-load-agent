// Appended to the generated AppDelegate.swift by prepare-ios.mjs so Xcode includes it.
// CARESTEAD_NATIVE_ADAPTER_BEGIN
import Capacitor

@objc(CaresteadViewController)
class CaresteadViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CaresteadAPI())
    }
}

@objc(CaresteadAPI)
public class CaresteadAPI: CAPPlugin, CAPBridgedPlugin, URLSessionTaskDelegate {
    public let identifier = "CaresteadAPI"
    public let jsName = "CaresteadAPI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openWeb", returnType: CAPPluginReturnPromise)
    ]
    private let allowedPaths: Set<String> = [
        "/api/auth/session", "/api/auth/sign-in", "/api/auth/sign-up", "/api/auth/sign-out", "/api/auth/guest",
        "/api/state", "/api/chat", "/api/calendar"
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
            guard let data = body.data(using: .utf8), data.count <= 262144,
                  (try? JSONSerialization.jsonObject(with: data)) != nil || body.isEmpty else {
                call.reject("Invalid request body.")
                return
            }
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = data
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
