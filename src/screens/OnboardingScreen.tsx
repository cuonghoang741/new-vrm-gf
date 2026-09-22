import React, { useState, useCallback, useRef, useEffect } from "react";
import { analyticsService } from "../services/AnalyticsService";
import { useAndroidBack } from "../hooks/useAndroidBack";
import { useTranslation } from "react-i18next";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Platform,
    ScrollView,
    Animated,
    Image,
    Alert,
    ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { GalaxyBackground } from "../components/GalaxyBackground";
import { StatusBar } from "expo-status-bar";
import {
    IconArrowRight,
    IconCheck,
    IconSparkles,
    IconGift,
    // Chip icons. These used to be emoji, which draw as "?" boxes on any device
    // whose font lacks the glyph — the same failure the language flags hit.
    IconMoodLookDown, IconStars, IconHeart, IconMoodWink, IconBrain,
    IconMountain, IconHandLoveYou, IconMoon,
    IconDeviceGamepad2, IconMusic, IconBallFootball, IconChefHat,
    IconPlane, IconBook, IconPalette, IconMovie, IconBarbell, IconLeaf,
    IconShirt, IconFlag,
} from "@tabler/icons-react-native";
import { supabase } from "../config/supabase";
import { useAuth } from "../hooks/useAuth";
import { Characters } from "../types/database";
import { getCharacters } from "../cache/charactersCache";
import { NativeAdCard } from "../components/ads/NativeAdCard";
import { preloadNative } from "../components/ads/nativeAdPreload";
import { AdUnits } from "../config/ads";
import * as SecureStore from "expo-secure-store";
import { track } from "../services/trackEvents";

const { width, height } = Dimensions.get("window");

// ─── Onboarding data ───
const AGE_RANGES = ["16-18", "18-24", "25-34", "35-44", "45+"];

const PERSONALITIES = [
    { key: "shy", Icon: IconMoodLookDown, label: "Shy" },
    { key: "outgoing", Icon: IconStars, label: "Outgoing" },
    { key: "romantic", Icon: IconHeart, label: "Romantic" },
    { key: "playful", Icon: IconMoodWink, label: "Playful" },
    { key: "intellectual", Icon: IconBrain, label: "Intellectual" },
    { key: "adventurous", Icon: IconMountain, label: "Adventurous" },
    { key: "caring", Icon: IconHandLoveYou, label: "Caring" },
    { key: "mysterious", Icon: IconMoon, label: "Mysterious" },
];

const INTERESTS = [
    { key: "anime", Icon: IconFlag, label: "Anime" },
    { key: "gaming", Icon: IconDeviceGamepad2, label: "Gaming" },
    { key: "music", Icon: IconMusic, label: "Music" },
    { key: "sports", Icon: IconBallFootball, label: "Sports" },
    { key: "cooking", Icon: IconChefHat, label: "Cooking" },
    { key: "travel", Icon: IconPlane, label: "Travel" },
    { key: "reading", Icon: IconBook, label: "Reading" },
    { key: "art", Icon: IconPalette, label: "Art" },
    { key: "movies", Icon: IconMovie, label: "Movies" },
    { key: "fitness", Icon: IconBarbell, label: "Fitness" },
    { key: "nature", Icon: IconLeaf, label: "Nature" },
    { key: "fashion", Icon: IconShirt, label: "Fashion" },
];

interface OnboardingScreenProps {
    onComplete: () => void;
}

/**
 * Ad slot per onboarding slide, keyed by `step` (0 = slide 1). Slide 2
 * (`step === 1`) is intentionally absent.
 */
const ONBOARDING_AD_SLOTS: Record<number, { unitId: string; placement: string }> = {
    0: { unitId: AdUnits.nativeOnboarding1, placement: "native_onboarding_1_1" },
    2: { unitId: AdUnits.nativeOnboarding2, placement: "native_onboarding_1_2" },
    3: { unitId: AdUnits.nativeOnboarding3, placement: "native_onboarding_1_3" },
};

export default function OnboardingScreen({
    onComplete,
}: OnboardingScreenProps) {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [step, setStep] = useState(0); // 0: age, 1: personality, 2: interests, 3: matching/result
    const [selectedAge, setSelectedAge] = useState<string | null>(null);
    const [selectedPersonalities, setSelectedPersonalities] = useState<string[]>(
        []
    );
    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
    const [matchedCharacter, setMatchedCharacter] = useState<Characters | null>(null);
    const [isMatching, setIsMatching] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const hasNotifiedRef = useRef(false);

    useEffect(() => {
        if (!user || hasNotifiedRef.current) return;

        // The "new user" Telegram notification is sent server-side now: a
        // trigger on auth.users creates the profile and the profiles trigger
        // calls handle-new-user. The app only fills in the country.
        const notify = async () => {
            try {
                hasNotifiedRef.current = true;
                const { authManager } = await import("../services/AuthManager");
                await authManager.updateCountryIfMissing(user.id);
            } catch (e) {
                hasNotifiedRef.current = false;
            }
        };
        notify();
    }, [user]);

    // Step 3 is the result screen, so only 0-2 are answerable questions.
    const STEP_NAMES = ["age", "personality", "interests", "result"];

    // Funnel entry. Fires once per onboarding attempt.
    useEffect(() => {
        analyticsService.logOnboardingStart();
        analyticsService.logOnboardingStep(STEP_NAMES[0], 0);
        track.onboardingStepView(1);
    }, []);

    const animateTransition = useCallback(
        (nextStep: number) => {
            analyticsService.logOnboardingStep(
                STEP_NAMES[nextStep] ?? String(nextStep),
                nextStep
            );
            // Sheet's onboarding rows: the four steps here are its four slides.
            track.onboardingStepView(((nextStep + 1) as 1 | 2 | 3 | 4));
            if (nextStep <= 3) track.onboardingNextSelect(nextStep);
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start(() => {
                setStep(nextStep);
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }).start();
            });
        },
        [fadeAnim]
    );

    const togglePersonality = useCallback((key: string) => {
        setSelectedPersonalities((prev) =>
            prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
        );
    }, []);

    const toggleInterest = useCallback((key: string) => {
        setSelectedInterests((prev) =>
            prev.includes(key) ? prev.filter((i) => i !== key) : [...prev, key]
        );
    }, []);

    const matchCharacter = useCallback(async () => {
        setIsMatching(true);

        const startTime = Date.now();

        try {
            // Use cached characters from SignInScreen (falls back to fresh fetch)
            const chars = await getCharacters();

            if (!chars || chars.length === 0) {
                Alert.alert(t("onb.err_title"), t("onb.err_no_characters"));
                setIsMatching(false);
                return;
            }

            // Prefer characters with more than 3 costumes; fallback to all if none qualify
            const richCostumeChars = chars.filter((c) => (c.total_costumes || 0) > 3);
            const pool = richCostumeChars.length > 0 ? richCostumeChars : chars;

            // Random pick from the pool
            const matched = pool[Math.floor(Math.random() * pool.length)];
            setMatchedCharacter(matched as Characters);

            // NOW transition to step 3 (only after we have a character)
            animateTransition(3);

            // Show result after minimum 1.5s animation (for visual feel)
            const elapsed = Date.now() - startTime;
            const remainingDelay = Math.max(0, 1500 - elapsed);

            setTimeout(() => {
                setIsMatching(false);
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 50,
                    friction: 8,
                    useNativeDriver: true,
                }).start();
            }, remainingDelay);
        } catch (e) {
            console.error("[Onboarding] Match error:", e);
            Alert.alert(t("onb.err_title"), t("onb.err_generic"));
            setIsMatching(false);
        }
    }, [animateTransition, scaleAnim]);

    // Back steps the questionnaire backwards instead of dumping the user out of
    // the app and losing every answer. Step 3 is the result, which we do not
    // rewind into (it would re-run matching); step 0 has nowhere to go.
    useAndroidBack(
        useCallback(() => {
            if (step > 0 && step < 3) {
                animateTransition(step - 1);
                return true;
            }
            return false;
        }, [step, animateTransition])
    );

    const handleClaim = useCallback(async () => {
        if (!matchedCharacter || !user?.id) {
            analyticsService.logOnboardingComplete("none");
            onComplete();
            return;
        }

        setIsClaiming(true);

        try {
            const userId = user.id;
            const charId = matchedCharacter.id;
            const bgDefaultId = matchedCharacter.background_default_id;

            // Cache to SecureStore for instant PlayScreen load
            const bgData = (matchedCharacter as any).backgrounds;
            await SecureStore.setItemAsync("play_last_character", JSON.stringify({
                characterId: charId,
                characterName: matchedCharacter.name,
                modelUrl: matchedCharacter.base_model_url ?? "",
                backgroundUrl: bgData?.image ?? null,
                backgroundId: bgDefaultId ?? null,
                thumbnailUrl: matchedCharacter.thumbnail_url ?? null,
            }));

            // Save assets (this is what checkOnboarding queries)
            const assetsToGrant: any[] = [
                { user_id: userId, item_id: charId, item_type: "character" },
            ];
            if (bgDefaultId) {
                assetsToGrant.push({ user_id: userId, item_id: bgDefaultId, item_type: "background" });
            }

            // Await DB operations to ensure they succeed (or can be retried).
            // This prevents a race condition where we transition to PlayScreen but the DB isn't ready.
            const saveWithRetry = async (retries = 1) => {
                try {
                    await Promise.all([
                        supabase.from("user_assets").insert(assetsToGrant),
                        supabase.from("user_preferences").update({
                            current_character_id: charId,
                            updated_at: new Date().toISOString(),
                        }).eq("user_id", userId).select().then(async ({ data }) => {
                            if (data && data.length === 0) {
                                await supabase.from("user_preferences").insert({ user_id: userId, current_character_id: charId, updated_at: new Date().toISOString() });
                            }
                        })
                    ]);
                } catch (e) {
                    if (retries > 0) {
                        console.warn("[Onboarding] Background save error, retrying in 500ms:", e);
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await supabase.auth.getSession();
                        await saveWithRetry(retries - 1);
                    } else {
                        throw e;
                    }
                }
            };

            await saveWithRetry();

            // Add a small 800ms artificial delay for the UX "{t("onb.setting_up")}" animation
            await new Promise(resolve => setTimeout(resolve, 800));
        } catch (e) {
            console.error("[Onboarding] Save error:", e);
        }

        setIsClaiming(false);
        analyticsService.logOnboardingComplete(matchedCharacter.id);
        track.onboardingGetStarted();
        track.characterStartChat(matchedCharacter.id);
        onComplete();
    }, [
        matchedCharacter,
        user?.id,
        selectedAge,
        selectedPersonalities,
        selectedInterests,
        onComplete,
    ]);

    const canProceed = true; // All steps are now optional

    const handleNext = () => {
        if (step < 2) {
            animateTransition(step + 1);
        } else if (step === 2) {
            matchCharacter();
        }
    };

    /**
     * Which native unit each slide carries. `null` = no ad on that slide.
     * Indexed by `step`, so the mapping is one thing to read rather than a
     * condition spread across the tree.
     */
    const onboardingAd = ONBOARDING_AD_SLOTS[step] ?? null;

    // Warm the next slide's unit while the user is answering this one — each
    // slot is a different unit, so without this every slide opens on a
    // skeleton.
    useEffect(() => {
        const next = ONBOARDING_AD_SLOTS[step + 1];
        if (next) preloadNative(next.unitId);
    }, [step]);

    const stepTitles = [
        t("onb.step1_title"),
        t("onb.step2_title"),
        t("onb.step3_title"),
    ];

    const stepSubtitles = [
        t("onb.step1_sub"),
        t("onb.step2_sub"),
        t("onb.step3_sub"),
    ];

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <LinearGradient
                colors={["#0a0a1a", "#1a0a2e", "#16083b", "#0d0221"]}
                style={styles.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />
            <GalaxyBackground transparentBase />

            <View style={styles.content}>
                {/* Progress bar */}
                {step < 3 && (
                    <View style={styles.progressContainer}>
                        {[0, 1, 2].map((i) => (
                            <View
                                key={i}
                                style={[
                                    styles.progressDot,
                                    i <= step && styles.progressDotActive,
                                ]}
                            />
                        ))}
                    </View>
                )}

                <Animated.View
                    style={[styles.stepContent, { opacity: fadeAnim }]}
                >
                    {/* ─── Step 0: Age ─── */}
                    {step === 0 && (
                        <>
                            <Text style={styles.stepTitle}>{stepTitles[0]}</Text>
                            <Text style={styles.stepSubtitle}>{stepSubtitles[0]}</Text>
                            <View style={styles.optionsGrid}>
                                {AGE_RANGES.map((age) => (
                                    <TouchableOpacity
                                        key={age}
                                        style={[
                                            styles.ageOption,
                                            selectedAge === age && styles.optionActive,
                                        ]}
                                        onPress={() => setSelectedAge(age)}
                                        activeOpacity={0.7}
                                    >
                                        <Text
                                            style={[
                                                styles.ageText,
                                                selectedAge === age && styles.optionTextActive,
                                            ]}
                                        >
                                            {age}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </>
                    )}

                    {/* ─── Step 1: Personality ─── */}
                    {step === 1 && (
                        <>
                            <Text style={styles.stepTitle}>{stepTitles[1]}</Text>
                            <Text style={styles.stepSubtitle}>{stepSubtitles[1]}</Text>
                            <View style={chipStyles.chipGrid}>
                                {PERSONALITIES.map((p) => {
                                    const isSelected = selectedPersonalities.includes(p.key);
                                    return (
                                        <TouchableOpacity
                                            key={p.key}
                                            style={[
                                                chipStyles.chip,
                                                isSelected && chipStyles.chipActive,
                                            ]}
                                            onPress={() => togglePersonality(p.key)}
                                            activeOpacity={0.7}
                                        >
                                            <p.Icon size={17} color={selectedPersonalities.includes(p.key) ? "#fff" : "rgba(255,255,255,0.75)"} />
                                            <Text
                                                style={[
                                                    chipStyles.chipLabel,
                                                    isSelected && chipStyles.chipLabelActive,
                                                ]}
                                            >
                                                {t(`trait.${p.key}`)}
                                            </Text>
                                            {isSelected && (
                                                <IconCheck
                                                    size={14}
                                                    color="#E85C93"
                                                    style={{ marginLeft: 4 }}
                                                />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    {/* ─── Step 2: Interests ─── */}
                    {step === 2 && (
                        <>
                            <Text style={styles.stepTitle}>{stepTitles[2]}</Text>
                            <Text style={styles.stepSubtitle}>{stepSubtitles[2]}</Text>
                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                // The CTA floats over the bottom of this list;
                                // without the padding the last row of chips sat
                                // under it and could not be tapped.
                                contentContainerStyle={[chipStyles.chipGrid, { paddingBottom: 96 }]}
                            >
                                {INTERESTS.map((i) => {
                                    const isSelected = selectedInterests.includes(i.key);
                                    return (
                                        <TouchableOpacity
                                            key={i.key}
                                            style={[
                                                chipStyles.chip,
                                                isSelected && chipStyles.chipActive,
                                            ]}
                                            onPress={() => toggleInterest(i.key)}
                                            activeOpacity={0.7}
                                        >
                                            <i.Icon size={17} color={selectedInterests.includes(i.key) ? "#fff" : "rgba(255,255,255,0.75)"} />
                                            <Text
                                                style={[
                                                    chipStyles.chipLabel,
                                                    isSelected && chipStyles.chipLabelActive,
                                                ]}
                                            >
                                                {t(`activity.${i.key}`)}
                                            </Text>
                                            {isSelected && (
                                                <IconCheck
                                                    size={14}
                                                    color="#E85C93"
                                                    style={{ marginLeft: 4 }}
                                                />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </>
                    )}

                    {/* ─── Step 3: Matching result ─── */}
                    {step === 3 && (
                        <View style={styles.matchContainer}>
                            {isMatching ? (
                                <View style={styles.matchingAnimation}>
                                    <IconSparkles size={48} color="#E85C93" />
                                    <Text style={styles.matchingText}>
                                        {t("onb.finding")}
                                    </Text>
                                    <View style={styles.matchingDots}>
                                        {[0, 1, 2].map((i) => (
                                            <Animated.View
                                                key={i}
                                                style={[styles.matchingDot]}
                                            />
                                        ))}
                                    </View>
                                </View>
                            ) : (
                                matchedCharacter && (
                                    <Animated.View
                                        style={[
                                            styles.resultCard,
                                            { transform: [{ scale: scaleAnim }] },
                                        ]}
                                    >
                                        <View style={styles.giftIcon}>
                                            <IconGift size={32} color="#FFD700" />
                                        </View>
                                        <Text style={styles.resultTitle}>{t("onb.your_match")}</Text>

                                        <View style={styles.characterCard}>
                                            {matchedCharacter.thumbnail_url && (
                                                <Image
                                                    source={{ uri: matchedCharacter.thumbnail_url }}
                                                    style={styles.characterImage}
                                                    resizeMode="cover"
                                                />
                                            )}
                                            <Text style={styles.characterName}>
                                                {matchedCharacter.name}
                                            </Text>
                                            {matchedCharacter.description && (
                                                <Text
                                                    style={styles.characterDesc}
                                                    numberOfLines={3}
                                                >
                                                    {matchedCharacter.description}
                                                </Text>
                                            )}
                                        </View>

                                        <TouchableOpacity
                                            style={[styles.startButton, isClaiming && { opacity: 0.7 }]}
                                            onPress={handleClaim}
                                            activeOpacity={0.8}
                                            disabled={isClaiming}
                                        >
                                            <LinearGradient
                                                colors={isClaiming ? ["#7a2d52", "#D44D85"] : ["#E85C93", "#FF8FB8"]}
                                                style={styles.startButtonGradient}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                            >
                                                {isClaiming ? (
                                                    <>
                                                        <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 10 }} />
                                                        <Text style={styles.startButtonText}>
                                                            {t("onb.setting_up")}
                                                        </Text>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Text style={styles.startButtonText}>
                                                            {t("onb.start_chatting_with", { name: matchedCharacter.name })}
                                                        </Text>
                                                        <IconArrowRight
                                                            size={20}
                                                            color="#FFFFFF"
                                                            style={{ marginLeft: 8 }}
                                                        />
                                                    </>
                                                )}
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </Animated.View>
                                )
                            )}
                        </View>
                    )}
                </Animated.View>

                {/* native_onboarding_1.1 / 1.2 / 1.3 — slides 1, 3 and 4, each
                    on its own ad unit so the three read separately in AdMob.
                    Slide 2 is deliberately left clear: three ads across four
                    slides is already the ceiling before onboarding reads as an
                    ad funnel. The slot collapses for PRO / no-fill. */}
                {onboardingAd && (
                    <View style={styles.adSlot}>
                        <NativeAdCard
                            key={onboardingAd.placement}
                            adUnitId={onboardingAd.unitId}
                            placement={onboardingAd.placement}
                        />
                    </View>
                )}

                {/* Next button */}
                {step < 3 && (
                    <TouchableOpacity
                        style={[styles.nextButton, !canProceed && styles.nextButtonDisabled]}
                        onPress={handleNext}
                        disabled={!canProceed}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.nextButtonText}>
                            {step === 2 ? t("onb.find_companion") : t("common.continue")}
                        </Text>
                        <IconArrowRight size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const chipStyles = StyleSheet.create({
    chipGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        justifyContent: "center",
    },
    chip: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 24,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.1)",
    },
    chipActive: {
        backgroundColor: "rgba(232, 92, 147, 0.2)",
        borderColor: "#E85C93",
    },
    chipEmoji: {
        fontSize: 18,
        marginRight: 6,
    },
    chipLabel: {
        fontSize: 15,
        color: "rgba(255,255,255,0.7)",
        fontWeight: "500",
    },
    chipLabelActive: {
        color: "#FFFFFF",
    },
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    gradient: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        flex: 1,
        paddingHorizontal: 28,
        paddingTop: Platform.OS === "ios" ? 70 : 50,
        paddingBottom: Platform.OS === "ios" ? 44 : 28,
    },
    progressContainer: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 8,
        marginBottom: 40,
    },
    progressDot: {
        width: 32,
        height: 4,
        borderRadius: 2,
        backgroundColor: "rgba(255,255,255,0.15)",
    },
    progressDotActive: {
        backgroundColor: "#E85C93",
        width: 48,
    },
    stepContent: {
        flex: 1,
    },
    stepTitle: {
        fontSize: 32,
        fontWeight: "800",
        color: "#FFFFFF",
        textAlign: "center",
        marginBottom: 8,
    },
    stepSubtitle: {
        fontSize: 15,
        color: "rgba(255,255,255,0.5)",
        textAlign: "center",
        marginBottom: 36,
    },
    optionsGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
        justifyContent: "center",
        paddingTop: 12,
    },
    ageOption: {
        paddingHorizontal: 28,
        paddingVertical: 16,
        borderRadius: 16,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.1)",
        minWidth: 90,
        alignItems: "center",
    },
    optionActive: {
        backgroundColor: "rgba(232, 92, 147, 0.2)",
        borderColor: "#E85C93",
    },
    ageText: {
        fontSize: 18,
        color: "rgba(255,255,255,0.7)",
        fontWeight: "600",
    },
    optionTextActive: {
        color: "#FFFFFF",
    },
    /**
     * The ad always lands next to a primary button — under "Start chatting" on
     * the result slide, above "Continue" on the others. The top gap is the
     * accidental-click margin that separation is there to buy: a native card
     * flush against a CTA is both a policy finding and a tap the user did not
     * mean to make.
     */
    adSlot: {
        paddingHorizontal: 20,
        // Margin on BOTH sides, because which side the button lands on changes
        // per slide: "Continue" sits below the card on slides 1 and 3, while on
        // the result slide the card sits below "Start chatting". A gap on one
        // side only leaves the card flush against the button on the other.
        marginTop: 24,
        marginBottom: 22,
    },
    matchContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    matchingAnimation: {
        alignItems: "center",
    },
    matchingText: {
        fontSize: 18,
        color: "rgba(255,255,255,0.7)",
        marginTop: 20,
        fontWeight: "500",
    },
    matchingDots: {
        flexDirection: "row",
        marginTop: 16,
        gap: 6,
    },
    matchingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "rgba(232, 92, 147,0.5)",
    },
    resultCard: {
        alignItems: "center",
        width: "100%",
    },
    giftIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: "rgba(255, 215, 0, 0.15)",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 16,
    },
    resultTitle: {
        fontSize: 28,
        fontWeight: "800",
        color: "#FFFFFF",
        marginBottom: 24,
    },
    characterCard: {
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 24,
        padding: 24,
        width: "100%",
        borderWidth: 1,
        borderColor: "rgba(232, 92, 147,0.3)",
        marginBottom: 32,
    },
    characterImage: {
        width: 120,
        height: 120,
        borderRadius: 60,
        marginBottom: 16,
        borderWidth: 3,
        borderColor: "rgba(232, 92, 147,0.5)",
    },
    characterName: {
        fontSize: 24,
        fontWeight: "700",
        color: "#FFFFFF",
        marginBottom: 8,
    },
    characterDesc: {
        fontSize: 14,
        color: "rgba(255,255,255,0.5)",
        textAlign: "center",
        lineHeight: 20,
    },
    startButton: {
        width: "100%",
        borderRadius: 16,
        overflow: "hidden",
        shadowColor: "#E85C93",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    startButtonGradient: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 18,
        paddingHorizontal: 24,
    },
    startButtonText: {
        fontSize: 17,
        fontWeight: "700",
        color: "#FFFFFF",
    },
    nextButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#E85C93",
        borderRadius: 16,
        paddingVertical: 18,
        gap: 8,
        shadowColor: "#E85C93",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    nextButtonDisabled: {
        backgroundColor: "rgba(232, 92, 147,0.3)",
        shadowOpacity: 0,
    },
    nextButtonText: {
        fontSize: 17,
        fontWeight: "700",
        color: "#FFFFFF",
    },
});
