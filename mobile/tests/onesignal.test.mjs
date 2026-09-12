import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('iOS notification extension has embedding and signing settings and shares the app group', { skip: process.platform !== 'darwin' }, () => {
  const project = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', 'ios/App/App.xcodeproj/project.pbxproj'], { encoding: 'utf8' }));
  const objects = project.objects;
  const app = Object.values(objects).find(object => object.isa === 'PBXNativeTarget' && object.name === 'App');
  const extensionEntry = Object.entries(objects).find(([, object]) => object.isa === 'PBXNativeTarget' && object.name === 'OneSignalNotificationServiceExtension');
  assert.ok(app && extensionEntry);
  const [extensionId, extension] = extensionEntry;
  assert.ok(objects[project.rootObject].targets.includes(extensionId));
  assert.ok(app.dependencies.some(id => objects[id].target === extensionId));
  assert.ok(app.buildPhases.some(id => objects[id].isa === 'PBXCopyFilesBuildPhase' && objects[id].files.some(file => objects[file].fileRef === extension.productReference)));
  for (const target of [app, extension]) {
    const configurations = objects[target.buildConfigurationList].buildConfigurations;
    for (const id of configurations) {
      const settings = objects[id].buildSettings;
      assert.equal(settings.IPHONEOS_DEPLOYMENT_TARGET, '15.0');
      assert.equal(settings.CODE_SIGN_STYLE, 'Automatic');
      const entitlements = readFileSync(`ios/App/${settings.CODE_SIGN_ENTITLEMENTS}`, 'utf8');
      assert.ok(entitlements.includes('group.com.carestead.mobile.onesignal'));
    }
  }
  assert.ok(extension.packageProductDependencies.some(id => objects[id].productName === 'OneSignalExtension'));
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(packageJson.dependencies['@onesignal/capacitor-plugin'], '1.0.6');
  assert.ok(readFileSync('ios/App/CapApp-SPM/Package.swift', 'utf8').includes('OnesignalCapacitorPlugin'));
});
