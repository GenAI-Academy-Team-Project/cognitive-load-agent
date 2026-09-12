import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
function cap(...args) {
  const result = spawnSync(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!existsSync('ios/App/App.xcodeproj')) cap('add', 'ios');
cap('sync', 'ios');
const delegatePath = 'ios/App/App/AppDelegate.swift';
const marker = '// CARESTEAD_NATIVE_ADAPTER_BEGIN';
const template = readFileSync(new URL('./CaresteadAPI.swift', import.meta.url), 'utf8');
const delegate = readFileSync(delegatePath, 'utf8').split(marker)[0].trimEnd();
writeFileSync(delegatePath, `${delegate}\n\n${template.slice(template.indexOf(marker))}\n`);
const storyboardPath = 'ios/App/App/Base.lproj/Main.storyboard';
const storyboard = readFileSync(storyboardPath, 'utf8');
if (!storyboard.includes('CAPBridgeViewController') && !storyboard.includes('CaresteadViewController')) {
  throw new Error('Unrecognized storyboard. Register CaresteadViewController before continuing.');
}
writeFileSync(storyboardPath, storyboard.replace('customClass="CAPBridgeViewController" customModule="Capacitor"', 'customClass="CaresteadViewController" customModule="App" customModuleProvider="target"'));
const checked = readFileSync(storyboardPath, 'utf8');
if (!checked.includes('customClass="CaresteadViewController"')) throw new Error('Native bridge registration failed.');
const scenePath = 'ios/App/App/SceneDelegate.swift';
if (existsSync(scenePath)) {
  const scene = readFileSync(scenePath, 'utf8').replace('CAPBridgeViewController()', 'CaresteadViewController()');
  if (!scene.includes('CaresteadViewController()')) throw new Error('Native scene registration failed.');
  writeFileSync(scenePath, scene);
}
const plistPath = 'ios/App/App/Info.plist';
let plist = readFileSync(plistPath, 'utf8');
for (const [key, description] of [
  ['NSMicrophoneUsageDescription', 'Use your microphone when you choose voice input in Carestead chat.'],
  ['NSSpeechRecognitionUsageDescription', 'Turn your spoken care question into text when you choose voice input.'],
]) {
  if (!plist.includes(`<key>${key}</key>`)) plist = plist.replace('</dict>\n</plist>', `\t<key>${key}</key>\n\t<string>${description}</string>\n</dict>\n</plist>`);
}
writeFileSync(plistPath, plist);
console.log('iOS project prepared. Open it with npm run ios:open and select your signing team in Xcode.');
