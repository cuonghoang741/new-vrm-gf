import React, { useState, useCallback, useRef, useEffect } from "react";
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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import {
    IconArrowRight,
    IconCheck,
    IconSparkles,
    IconGift,
} from "@tabler/icons-react-native";
import { supabase } from "../config/supabase";
import { useAuth } from "../hooks/useAuth";
import { Characters } from "../types/database";

const { width, height } = Dimensions.get("window");

// ─── Onboarding data ───
const AGE_RANGES = ["16-18", "18-24", "25-34", "35-44", "45+"];

const PERSONALITIES = [
    { key: "shy", emoji: "🥺", label: "Shy" },
    { key: "outgoing", emoji: "🤩", label: "Outgoing" },
    { key: "romantic", emoji: "💕", label: "Romantic" },
    { key: "playful", emoji: "😜", label: "Playful" },
    { key: "intellectual", emoji: "🧠", label: "Intellectual" },
    { key: "adventurous", emoji: "🏔️", label: "Adventurous" },
    { key: "caring", emoji: "🤗", label: "Caring" },
    { key: "mysterious", emoji: "🌙", label: "Mysterious" },
];

const INTERESTS = [
    { key: "anime", emoji: "🎌", label: "Anime" },
    { key: "gaming", emoji: "🎮", label: "Gaming" },
    { key: "music", emoji: "🎵", label: "Music" },
    { key: "sports", emoji: "⚽", label: "Sports" },
    { key: "cooking", emoji: "🍳", label: "Cooking" },
    { key: "travel", emoji: "✈️", label: "Travel" },
    { key: "reading", emoji: "📚", label: "Reading" },
    { key: "art", emoji: "🎨", label: "Art" },
    { key: "movies", emoji: "🎬", label: "Movies" },
    { key: "fitness", emoji: "💪", label: "Fitness" },
    { key: "nature", emoji: "🌿", label: "Nature" },
    { key: "fashion", emoji: "👗", label: "Fashion" },
];

interface OnboardingScreenProps {
    onComplete: () => void;
}

export default function OnboardingScreen({
    onComplete,
}: OnboardingScreenProps) {
    const { user } = useAuth();
    const [step, setStep] = useState(0); // 0: age, 1: personality, 2: interests, 3: matching/result
    const [selectedAge, setSelectedAge] = useState<string | null>(null);
    const [selectedPersonalities, setSelectedPersonalities] = useState<string[]>(
        []
    );
    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
    const [matchedCharacter, setMatchedCharacter] = useState<Characters | null>(
        null
    );
    const [isMatching, setIsMatching] = useState(false);
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const scaleAnim = useRef(new Animated.Value(0)).current;

    const animateTransition = useCallback(
        (nextStep: number) => {
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
        animateTransition(3);

        try {
            // Fetch available characters
            const { data: chars, error } = await supabase
                .from("characters")
                .select("*, backgrounds!background_default_id(id, name, image)")
                .eq("is_public", true)
                .eq("available", true)
                .not("base_model_url", "ilike", "%.png")
                .order("order", { ascending: true });

            if (error || !chars || chars.length === 0) {
                Alert.alert("Error", "Could not find characters.");
                setIsMatching(false);
                return;
            }

            // Random pick
            const matched = chars[Math.floor(Math.random() * Math.min(4, chars.length))];
            setMatchedCharacter(matched as Characters);

            // Save to database — update existing row, or insert if none exists
            if (user?.id) {
                const payload = {
                    age_range: selectedAge,
                    personality: selectedPersonalities,
                    interests: selectedInterests,
                    current_character_id: matched.id,
                    matched_character_id: matched.id,
                    matched_background_id: matched.background_default_id,
                    onboarding_completed: true,
                    updated_at: new Date().toISOString(),
                };

                // Try update first
                const { data: updated, error: updateError } = await supabase
                    .from("user_preferences")
                    .update(payload)
                    .eq("user_id", user.id)
                    .select("id")
                    .maybeSingle();

                // If no row existed, insert
                if (!updated && !updateError) {
                    await supabase
                        .from("user_preferences")
                        .insert({ user_id: user.id, ...payload });
                }

                console.log("[Onboarding] Saved preferences, onboarding_completed=true");
            }

            // Fake 1s loading then reveal
            setTimeout(() => {
                setIsMatching(false);
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 50,
                    friction: 8,
                    useNativeDriver: true,
                }).start();
            }, 1000);
        } catch (e) {
            console.error("Match error:", e);
            setIsMatching(false);
        }
    }, [
        selectedAge,
        selectedPersonalities,
        selectedInterests,
        user?.id,
        animateTransition,
        scaleAnim,
    ]);

    const canProceed =
        (step === 0 && selectedAge) ||
        (step === 1 && selectedPersonalities.length > 0) ||
        (step === 2 && selectedInterests.length > 0);

    const handleNext = () => {
        if (step < 2) {
            animateTransition(step + 1);
        } else if (step === 2) {
            matchCharacter();
        }
    };

    const stepTitles = [
        "How old are you?",
        "What's your vibe?",
        "What do you enjoy?",
    ];

    const stepSubtitles = [
        "We'll personalize your experience",
        "Choose traits that describe you",
        "Pick your favorite activities",
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
                            <View style={styles.chipGrid}>
                                {PERSONALITIES.map((p) => {
                                    const isSelected = selectedPersonalities.includes(p.key);
                                    return (
                                        <TouchableOpacity
                                            key={p.key}
                                            style={[
                                                styles.chip,
                                                isSelected && styles.chipActive,
                                            ]}
                                            onPress={() => togglePersonality(p.key)}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={styles.chipEmoji}>{p.emoji}</Text>
                                            <Text
                                                style={[
                                                    styles.chipLabel,
                                                    isSelected && styles.chipLabelActive,
                                                ]}
                                            >
                                                {p.label}
                                            </Text>
                                            {isSelected && (
                                                <IconCheck
                                                    size={14}
                                                    color="#6633CC"
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
                                contentContainerStyle={styles.chipGrid}
                            >
                                {INTERESTS.map((i) => {
                                    const isSelected = selectedInterests.includes(i.key);
                                    return (
                                        <TouchableOpacity
                                            key={i.key}
                                            style={[
                                                styles.chip,
                                                isSelected && styles.chipActive,
                                            ]}
                                            onPress={() => toggleInterest(i.key)}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={styles.chipEmoji}>{i.emoji}</Text>
                                            <Text
                                                style={[
                                                    styles.chipLabel,
                                                    isSelected && styles.chipLabelActive,
                                                ]}
                                            >
                                                {i.label}
                                            </Text>
                                            {isSelected && (
                                                <IconCheck
                                                    size={14}
                                                    color="#6633CC"
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
                                    <IconSparkles size={48} color="#6633CC" />
                                    <Text style={styles.matchingText}>
                                        Finding your perfect companion...
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
                                        <Text style={styles.resultTitle}>Your match!</Text>

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
                                            style={styles.startButton}
                                            onPress={onComplete}
                                            activeOpacity={0.8}
                                        >
                                            <LinearGradient
                                                colors={["#6633CC", "#8855EE"]}
                                                style={styles.startButtonGradient}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                            >
                                                <Text style={styles.startButtonText}>
                                                    Start chatting with {matchedCharacter.name}
                                                </Text>
                                                <IconArrowRight
                                                    size={20}
                                                    color="#FFFFFF"
                                                    style={{ marginLeft: 8 }}
                                                />
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </Animated.View>
                                )
                            )}
                        </View>
                    )}
                </Animated.View>

                {/* Next button */}
                {step < 3 && (
                    <TouchableOpacity
                        style={[styles.nextButton, !canProceed && styles.nextButtonDisabled]}
                        onPress={handleNext}
                        disabled={!canProceed}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.nextButtonText}>
                            {step === 2 ? "Find my companion" : "Continue"}
                        </Text>
                        <IconArrowRight size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

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
        backgroundColor: "#6633CC",
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
        backgroundColor: "rgba(102, 51, 204, 0.2)",
        borderColor: "#6633CC",
    },
    ageText: {
        fontSize: 18,
        color: "rgba(255,255,255,0.7)",
        fontWeight: "600",
    },
    optionTextActive: {
        color: "#FFFFFF",
    },
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
        backgroundColor: "rgba(102, 51, 204, 0.2)",
        borderColor: "#6633CC",
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
        backgroundColor: "rgba(102,51,204,0.5)",
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
        borderColor: "rgba(102,51,204,0.3)",
        marginBottom: 32,
    },
    characterImage: {
        width: 120,
        height: 120,
        borderRadius: 60,
        marginBottom: 16,
        borderWidth: 3,
        borderColor: "rgba(102,51,204,0.5)",
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
        shadowColor: "#6633CC",
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
        backgroundColor: "#6633CC",
        borderRadius: 16,
        paddingVertical: 18,
        gap: 8,
        shadowColor: "#6633CC",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    nextButtonDisabled: {
        backgroundColor: "rgba(102,51,204,0.3)",
        shadowOpacity: 0,
    },
    nextButtonText: {
        fontSize: 17,
        fontWeight: "700",
        color: "#FFFFFF",
    },
});
