import React, { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { IconCamera, IconCheck } from "@tabler/icons-react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "../../config/supabase";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";

interface EditProfileSheetProps {
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    userId?: string;
    currentName: string | null;
    currentAvatar: string | null;
    onProfileUpdated: (name: string, avatar: string | null) => void;
}

export type EditProfileSheetRef = BottomSheetRef;

const EditProfileSheet = forwardRef<EditProfileSheetRef, EditProfileSheetProps>(({
    isOpened,
    onIsOpenedChange,
    userId,
    currentName,
    currentAvatar,
    onProfileUpdated,
}, ref) => {
    const sheetRef = useRef<BottomSheetRef>(null);
    const [name, setName] = useState("");
    const [bio, setBio] = useState("");
    const [saving, setSaving] = useState(false);

    useImperativeHandle(ref, () => ({
        present: (index?: number) => sheetRef.current?.present(index),
        dismiss: () => sheetRef.current?.dismiss(),
    }));

    // Load current values when opened
    useEffect(() => {
        if (isOpened && userId) {
            setName(currentName ?? "");
            // Load bio
            supabase
                .from("profiles")
                .select("bio")
                .eq("id", userId)
                .maybeSingle()
                .then(({ data }) => {
                    if (data?.bio) setBio(data.bio);
                });
        }
    }, [isOpened, userId, currentName]);

    const handleSave = useCallback(async () => {
        if (!userId || !name.trim()) {
            Alert.alert("Error", "Display name cannot be empty");
            return;
        }

        setSaving(true);
        try {
            const { error } = await supabase
                .from("profiles")
                .update({
                    display_name: name.trim(),
                    bio: bio.trim() || null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", userId);

            if (error) throw error;

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onProfileUpdated(name.trim(), currentAvatar);
            onIsOpenedChange(false);
            sheetRef.current?.dismiss();
        } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to save profile");
        } finally {
            setSaving(false);
        }
    }, [userId, name, bio, currentAvatar, onProfileUpdated, onIsOpenedChange]);

    const initial = name?.charAt(0)?.toUpperCase() ?? "?";

    return (
        <BottomSheet
            ref={sheetRef}
            isOpened={isOpened}
            onIsOpenedChange={onIsOpenedChange}
            title="Edit Profile"
            isDarkBackground
            detents={[0.6, 0.85]}
            backgroundBlur="system-thick-material-dark"
        >
            <View style={{ flex: 1 }}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={{ flex: 1 }}
                >
                    <ScrollView
                        contentContainerStyle={styles.content}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* Avatar */}
                        <View style={styles.avatarSection}>
                            <TouchableOpacity style={styles.avatarWrap} activeOpacity={0.7}>
                                {currentAvatar ? (
                                    <Image source={{ uri: currentAvatar }} style={styles.avatar} />
                                ) : (
                                    <View style={styles.avatarFallback}>
                                        <Text style={styles.avatarText}>{initial}</Text>
                                    </View>
                                )}
                                <View style={styles.cameraButton}>
                                    <IconCamera size={16} color="#FFFFFF" />
                                </View>
                            </TouchableOpacity>
                            <Text style={styles.changePhotoText}>Tap to change photo</Text>
                        </View>

                        {/* Name */}
                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={styles.input}
                                    value={name}
                                    onChangeText={setName}
                                    placeholder="Enter your name"
                                    placeholderTextColor="rgba(255,255,255,0.25)"
                                    maxLength={30}
                                    returnKeyType="next"
                                />
                            </View>
                        </View>

                        {/* Bio */}
                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>BIO</Text>
                            <View style={[styles.inputContainer, styles.bioContainer]}>
                                <TextInput
                                    style={[styles.input, styles.bioInput]}
                                    value={bio}
                                    onChangeText={setBio}
                                    placeholder="Tell us about yourself..."
                                    placeholderTextColor="rgba(255,255,255,0.25)"
                                    multiline
                                    maxLength={160}
                                    textAlignVertical="top"
                                />
                            </View>
                            <Text style={styles.charCount}>{bio.length}/160</Text>
                        </View>

                        {/* Save button */}
                        <TouchableOpacity
                            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                            onPress={handleSave}
                            disabled={saving}
                            activeOpacity={0.8}
                        >
                            <IconCheck size={20} color="#FFFFFF" />
                            <Text style={styles.saveButtonText}>
                                {saving ? "Saving..." : "Save Changes"}
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        </BottomSheet>
    );
});

export default EditProfileSheet;

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 40 },

    // Avatar
    avatarSection: { alignItems: "center", marginBottom: 28 },
    avatarWrap: { position: "relative", marginBottom: 8 },
    avatar: { width: 80, height: 80, borderRadius: 40 },
    avatarFallback: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: "#8B5CF6", alignItems: "center", justifyContent: "center",
    },
    avatarText: { fontSize: 32, fontWeight: "800", color: "#FFFFFF" },
    cameraButton: {
        position: "absolute", bottom: 0, right: 0,
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center",
        borderWidth: 2, borderColor: "rgba(139, 92, 246, 0.4)",
    },
    changePhotoText: { fontSize: 13, color: "rgba(255,255,255,0.4)" },

    // Fields
    fieldGroup: { marginBottom: 20 },
    fieldLabel: {
        fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.35)",
        letterSpacing: 1, marginBottom: 8, marginLeft: 4,
    },
    inputContainer: {
        backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14,
        borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
        paddingHorizontal: 16, paddingVertical: 12,
    },
    input: { fontSize: 16, color: "#FFFFFF", fontWeight: "500" },
    bioContainer: { minHeight: 90 },
    bioInput: { minHeight: 70 },
    charCount: {
        textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.3)",
        marginTop: 4, marginRight: 4,
    },

    // Save button
    saveButton: {
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        backgroundColor: "#8B5CF6", borderRadius: 16,
        paddingVertical: 16, marginTop: 8, gap: 8,
    },
    saveButtonDisabled: { opacity: 0.5 },
    saveButtonText: { fontSize: 17, fontWeight: "700", color: "#FFFFFF" },
});
