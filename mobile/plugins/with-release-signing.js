const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

/**
 * 给 release 构建换上真正的签名证书。
 *
 * ## 为什么要有这个插件
 *
 * Expo 生成的 `android/app/build.gradle` 里，release 用的是 **debug 证书**
 * （它自己在那儿留了一句 "Caution! In production, you need to generate your own keystore"）。
 * debug 证书是所有 Android 项目共用的一把公开的钥匙——用它签出来的包，
 * 任何人都能签一个"更新"覆盖掉，等于没签。
 *
 * 直接去改 `android/app/build.gradle` 也能解决，但 `android/` 这个目录是
 * `expo prebuild` 生成的、而且在 .gitignore 里（CNG 模式）。下次 `--clean` 一跑，
 * 手改的那几行就没了，而且是**悄悄没的**——构建照样成功，只是又签回了 debug 证书。
 * 写成插件，这件事就跟着 app.json 走，每次 prebuild 自动补上。
 *
 * ## 密码存在哪
 *
 * 不在这个仓库里。四个值放在 `~/.gradle/gradle.properties`（用户级，gradle 自己会读），
 * 证书文件放在 `mobile/credentials/`（.gitignore 里的 `*.jks` 盖住了它）。
 * 两样都不进 git，也都不在 `android/` 底下——所以 `prebuild --clean` 动不到它们。
 *
 * **这把钥匙丢了，就再也没法给同一个 App 发更新了**：Android 认证书不认名字，
 * 换一把签出来的包会被系统当成另一个 App，装不上去也覆盖不了。
 */
const withReleaseSigning = (config) => {
  const signed = withAppBuildGradle(config, (gradleConfig) => {
    gradleConfig.modResults.contents = addReleaseSigningConfig(gradleConfig.modResults.contents);
    gradleConfig.modResults.contents = pointReleaseBuildAtIt(gradleConfig.modResults.contents);
    return gradleConfig;
  });
  return withArmOnlyAbis(signed);
};

/**
 * 只编 ARM 那两套原生库，把 x86 / x86_64 去掉。
 *
 * 默认四套全编，光原生库就 90 MB（整包 116 MB），其中 x86 那两套占 50 MB——
 * **而它们只有模拟器用得上**，市面上的 Android 手机没有 x86 的。
 * 这个包是要发到 GitHub Release 上给人下载的，一半体积换一个没人会用的架构不划算。
 *
 * 代价：这个 APK 装不进 x86_64 的模拟器。真要在模拟器上试，跑 debug 构建，
 * 或者临时 `./gradlew assembleRelease -PreactNativeArchitectures=x86_64`——
 * 命令行传的会盖过这里写进 gradle.properties 的值。
 */
function withArmOnlyAbis(config) {
  return withGradleProperties(config, (gradleConfig) => {
    const properties = gradleConfig.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'reactNativeArchitectures'),
    );
    properties.push({ type: 'property', key: 'reactNativeArchitectures', value: 'armeabi-v7a,arm64-v8a' });
    gradleConfig.modResults = properties;
    return gradleConfig;
  });
}

const RELEASE_SIGNING_CONFIG = `        release {
            // 凭证从 ~/.gradle/gradle.properties 读，仓库里一个字都没有
            if (project.hasProperty('CORDDAILY_UPLOAD_STORE_FILE')) {
                storeFile file(CORDDAILY_UPLOAD_STORE_FILE)
                storePassword CORDDAILY_UPLOAD_STORE_PASSWORD
                keyAlias CORDDAILY_UPLOAD_KEY_ALIAS
                keyPassword CORDDAILY_UPLOAD_KEY_PASSWORD
            } else {
                // 没配凭证就退回 debug 证书：别人 clone 下来跑 assembleRelease 该能跑通，
                // 而不是撞在一个他不知道怎么解决的构建错误上。这样签出来的包发不了正式版，
                // 但那是打包的人该关心的事，不是让构建直接失败的理由
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
`;

function addReleaseSigningConfig(contents) {
  if (contents.includes('CORDDAILY_UPLOAD_STORE_FILE')) return contents;

  // 插在 signingConfigs 那个块的开头。找 `signingConfigs {` 而不是找 debug 块的结尾——
  // 后者要数花括号，而这一句在模板里是唯一的
  const anchor = 'signingConfigs {\n';
  const at = contents.indexOf(anchor);
  if (at === -1) throw new Error('在 build.gradle 里找不到 signingConfigs 块，Expo 的模板可能改了');

  const insertAt = at + anchor.length;
  return contents.slice(0, insertAt) + RELEASE_SIGNING_CONFIG + contents.slice(insertAt);
}

function pointReleaseBuildAtIt(contents) {
  // `signingConfig signingConfigs.debug` 在模板里出现两次（debug 和 release 两个 buildType），
  // 所以连着它上面那两行注释一起匹配——那两行只在 release 那一处
  const target = /\/\/ Caution! In production[\s\S]*?signingConfig signingConfigs\.debug/;
  if (!target.test(contents)) {
    // 已经改过了（非 --clean 的 prebuild 会在改过的文件上再跑一遍），或者模板变了
    if (contents.includes('signingConfig signingConfigs.release')) return contents;
    throw new Error('在 build.gradle 里找不到 release 那条 signingConfig，Expo 的模板可能改了');
  }
  return contents.replace(target, 'signingConfig signingConfigs.release');
}

module.exports = withReleaseSigning;
