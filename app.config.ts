import { ConfigContext, ExpoConfig } from "expo/config";

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

export default ({ config }: ConfigContext): ExpoConfig => ({
    name: APP_NAME,
    icon: ICON,
    scheme: SCHEME,
    version: "1.0.0",
    slug: PROJECT_SLUG,
    orientation: "portrait",
    userInterfaceStyle: "dark",
    newArchEnabled: true,

    extra: {
        eas: {
            projectId: EAS_PROJECT_ID,
        },
    },

    splash: {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#8B5CF6",
    },

    ios: {
        supportsTablet: true,
        bundleIdentifier: BUNDLE_IDENTIFIER,
        buildNumber: "1",
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
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
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
        "expo-apple-authentication",
        "expo-web-browser",
        "expo-asset",
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
