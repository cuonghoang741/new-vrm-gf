import { ConfigContext, ExpoConfig } from "expo/config";
import { version } from './package.json';

// EAS config
const EAS_PROJECT_ID = "763d2cb3-8cdf-4678-bed6-b4baabdacdf9"; // Set from 'eas init'
const PROJECT_SLUG = "truefeel";

// App production config
const APP_NAME = "TrueFeel";
const BUNDLE_IDENTIFIER = "com.truefeel";
const PACKAGE_NAME = "com.eduto.truefeel";
const ICON = "./assets/logo.png";
const ANDROID_ICON_FOREGROUND = "./assets/logo.png";
const SCHEME = "truefeel";

// Analytics & SDK Configs (Placeholders)
const FB_APP_ID = "1627762991596472";
const FB_CLIENT_TOKEN = "07d15e25aed78596c59d844afd323a2f";
const APPSFLYER_DEV_KEY = "9PnQZkZDCb8dXSaRinRZAN";
const APPSFLYER_APP_ID = "6760695348";

export default ({ config }: ConfigContext): ExpoConfig => ({
    name: APP_NAME,
    icon: ICON,
    scheme: SCHEME,
    version: version,
    slug: PROJECT_SLUG,
    orientation: "portrait",
    userInterfaceStyle: "dark",
    newArchEnabled: true,



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
        backgroundColor: "#8B5CF6",
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
            backgroundColor: "#8B5CF6",
            foregroundImage: ANDROID_ICON_FOREGROUND,
        },
        package: PACKAGE_NAME,
        versionCode: 1,
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
        "./plugins/withFirebaseSetup",
        "@react-native-firebase/app",
        "expo-apple-authentication",
        "expo-web-browser",
        "expo-asset",
        [
            "react-native-fbsdk-next",
            {
                "appID": FB_APP_ID,
                "clientToken": FB_CLIENT_TOKEN,
                "displayName": APP_NAME,
                "scheme": `fb${FB_APP_ID}`
            }
        ],
        "expo-tracking-transparency",
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
                backgroundColor: "#8B5CF6",
            },
        ],
        [
            "expo-secure-store",
            {
                faceIDPermission:
                    "Allow TrueFeel to access your Face ID for secure authentication.",
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
