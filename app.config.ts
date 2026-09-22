import { ConfigContext, ExpoConfig } from "expo/config";
import { version } from './package.json';

// EAS config
const EAS_PROJECT_ID = "956f5391-596e-4873-8dc2-331df23f5cd3"; // Set from 'eas init'
const PROJECT_SLUG = "truemate";
const EAS_OWNER = "hoangcuongdcyb365";

// App production config
// The store listing, the launcher label and the Facebook display name are
// all "TrueMate" — the Android package (com.truemate.girlfriend) always was.
const APP_NAME = "TrueMate";
const BUNDLE_IDENTIFIER = "com.truefeel";
const PACKAGE_NAME = "com.truemate.girlfriend";
const ICON = "./assets/logo.png";
const ANDROID_ICON_FOREGROUND = "./assets/adaptive-icon.png";
const SCHEME = "truefeel";

// Analytics & SDK Configs (Placeholders)
const FB_APP_ID = "1390680469942660";
const FB_CLIENT_TOKEN = "bc1d93ee330bef3066ad2333b41c808e";
const APPSFLYER_DEV_KEY = "9PnQZkZDCb8dXSaRinRZAN";
const APPSFLYER_APP_ID = "6760695348";

export default ({ config }: ConfigContext): ExpoConfig => ({
    name: APP_NAME,
    icon: ICON,
    scheme: SCHEME,
    version: version,
    slug: PROJECT_SLUG,
    owner: EAS_OWNER,
    orientation: "portrait",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    backgroundColor: "#FFC2DA",



    extra: {
        eas: {
            projectId: EAS_PROJECT_ID,
        },
    },

    updates: {
        url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
        checkAutomatically: 'ON_LOAD',
        fallbackToCacheTimeout: 0,
    },
    runtimeVersion: {
        policy: "appVersion",
    },


    splash: {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#FFC2DA",
    },

    ios: {
        supportsTablet: true,
        bundleIdentifier: BUNDLE_IDENTIFIER,
        buildNumber: "11",
        googleServicesFile: "./GoogleService-Info.plist",
        infoPlist: {
            ITSAppUsesNonExemptEncryption: false,
            NSCameraUsageDescription: "Allow $(PRODUCT_NAME) to access your camera to enable video calls with your AI.",
            NSMicrophoneUsageDescription: "Allow $(PRODUCT_NAME) to access your microphone to enable voice and video calls with your AI.",
        },
        requireFullScreen: false,
        usesAppleSignIn: true,
    },

    android: {
        adaptiveIcon: {
            backgroundColor: "#FFC2DA",
            foregroundImage: ANDROID_ICON_FOREGROUND,
        },
        package: PACKAGE_NAME,
        // Auto-increasing, always-unique versionCode (minutes since epoch).
        // Guarantees every build is higher than the last with no manual bumping.
        versionCode: Math.floor(Date.now() / 60000),
        googleServicesFile: "./google-services.json",
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
        permissions: [
            "android.permission.CAMERA",
            "android.permission.RECORD_AUDIO",
            "android.permission.WRITE_EXTERNAL_STORAGE",
        ],
        intentFilters: [
            {
                action: "VIEW",
                data: [
                    {
                        scheme: SCHEME,
                        host: "auth",
                        pathPrefix: "/callback",
                    },
                ],
                category: ["BROWSABLE", "DEFAULT"],
            },
        ],
    },

    web: {
        favicon: "./assets/logo.png",
    },

    plugins: [
        './withCustomPodfile',
        "./plugins/withFirebaseSetup",
        "./plugins/withAndroidBackupRulesFix",
        "./plugins/withCopyIndexHtml",
        "./plugins/withAdMediation",
        [
            "react-native-google-mobile-ads",
            {
                androidAppId: "ca-app-pub-4908431670564026~7331803480",
                iosAppId: "ca-app-pub-4908431670564026~7220122843",
                userTrackingUsageDescription:
                    "This identifier will be used to deliver personalized ads to you.",
                optimizeInitialization: true,
                optimizeAdLoading: true,
                // Same SKAdNetwork list as Yuuki (Google + the mediation
                // networks' buyers). Without it iOS installs from those
                // networks cannot be attributed, so they bid lower or not at all.
                skAdNetworkItems: [
                    "cstr6suwn9.skadnetwork",
                    "4fzdc2evr5.skadnetwork",
                    "2fnua5tdw4.skadnetwork",
                    "ydx93a7ass.skadnetwork",
                    "p78axxw29g.skadnetwork",
                    "v72qych5uu.skadnetwork",
                    "ludvb6z3bs.skadnetwork",
                    "cp8zw746q7.skadnetwork",
                    "3sh42y64q3.skadnetwork",
                    "c6k4g5qg8m.skadnetwork",
                    "s39g8k73mm.skadnetwork",
                    "3qy4746246.skadnetwork",
                    "hs6bdukanm.skadnetwork",
                    "mlmmfzh3r3.skadnetwork",
                    "v4nxqhlyqp.skadnetwork",
                    "wzmmz9fp6w.skadnetwork",
                    "su67r6k2v3.skadnetwork",
                    "yclnxrl5pm.skadnetwork",
                    "7ug5zh24hu.skadnetwork",
                    "gta9lk7p23.skadnetwork",
                    "vutu7akeur.skadnetwork",
                    "y5ghdn5j9k.skadnetwork",
                    "v9wttpbfk9.skadnetwork",
                    "n38lu8286q.skadnetwork",
                    "47vhws6wlr.skadnetwork",
                    "kbd757ywx3.skadnetwork",
                    "9t245vhmpl.skadnetwork",
                    "a2p9lx4jpn.skadnetwork",
                    "22mmun2rn5.skadnetwork",
                    "44jx6755aq.skadnetwork",
                    "k674qkevps.skadnetwork",
                    "4468km3ulz.skadnetwork",
                    "2u9pt9hc89.skadnetwork",
                    "8s468mfl3y.skadnetwork",
                    "klf5c3l5u5.skadnetwork",
                    "ppxm28t8ap.skadnetwork",
                    "kbmxgpxpgc.skadnetwork",
                    "uw77j35x4d.skadnetwork",
                    "578prtvx9j.skadnetwork",
                    "4dzt52r2t5.skadnetwork",
                    "tl55sbb4fm.skadnetwork",
                    "e5fvkxwrpn.skadnetwork",
                    "8c4e2ghe7u.skadnetwork",
                    "3rd42ekr43.skadnetwork",
                    "3qcr597p9d.skadnetwork",
                ],
            },
        ],
        "@react-native-firebase/app",
        "expo-apple-authentication",
        "expo-web-browser",
        "expo-asset",
        // [
        //     "react-native-fbsdk-next",
        //     {
        //         "appID": FB_APP_ID,
        //         "clientToken": FB_CLIENT_TOKEN,
        //         "displayName": APP_NAME,
        //         "scheme": `fb${FB_APP_ID}`
        //     }
        // ],
        [
            './withFacebookConfig',
            {
                appId: FB_APP_ID,
                displayName: APP_NAME,
                clientToken: FB_CLIENT_TOKEN,
            },
        ],
        [
            "react-native-appsflyer",
            {
                "appleAppId": APPSFLYER_APP_ID,
                "devKey": APPSFLYER_DEV_KEY
            }
        ],
        [
            "expo-splash-screen",
            {
                image: "./assets/splash-icon.png",
                resizeMode: "contain",
                backgroundColor: "#FFC2DA",
            },
        ],
        [
            "expo-secure-store",
            {
                faceIDPermission:
                    "Allow TrueMate to access your Face ID for secure authentication.",
            },
        ],
        [
            "@livekit/react-native-expo-plugin",
            {
                "cameraPermission": "Allow $(PRODUCT_NAME) to access your camera to enable video calls with your AI.",
                "microphonePermission": "Allow $(PRODUCT_NAME) to access your microphone to enable voice and video calls with your AI."
            }
        ],
        [
            "expo-camera",
            {
                "cameraPermission": "Allow $(PRODUCT_NAME) to access your camera to enable video calls with your AI.",
                "microphonePermission": "Allow $(PRODUCT_NAME) to access your microphone to enable voice and video calls with your AI."
            }
        ],
        [
            "expo-av",
            {
                "microphonePermission": "Allow $(PRODUCT_NAME) to access your microphone to enable voice and video calls with your AI."
            }
        ]
    ],

    experiments: {
        typedRoutes: false,
        reactCompiler: false,
    },
});
