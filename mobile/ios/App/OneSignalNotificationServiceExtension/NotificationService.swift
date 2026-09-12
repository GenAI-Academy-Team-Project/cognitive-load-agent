import UserNotifications
import OneSignalExtension

class NotificationService: UNNotificationServiceExtension {
    var contentHandler: ((UNNotificationContent) -> Void)?
    var receivedRequest: UNNotificationRequest!
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        receivedRequest = request
        bestAttemptContent = request.content.mutableCopy() as? UNMutableNotificationContent
        if let content = bestAttemptContent {
            OneSignalExtension.didReceiveNotificationExtensionRequest(request, with: content, withContentHandler: contentHandler)
        } else {
            contentHandler(request.content)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let content = bestAttemptContent, let handler = contentHandler {
            OneSignalExtension.serviceExtensionTimeWillExpireRequest(receivedRequest, with: content)
            handler(content)
        }
    }
}
