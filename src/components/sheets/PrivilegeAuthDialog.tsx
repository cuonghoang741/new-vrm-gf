import React, { useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { redeemPrivilege } from "../../services/economyService";

const ACCENT = "#F83D7B";

/**
 * Privilege Authenticator — the reviewer / partner login (Yuuki's
 * _PrivilegeAuthSheet). A correct username + password makes the signed-in
 * account PRO.
 *
 * Unlike Yuuki, the credentials are NOT in the app: the server checks them
 * (bcrypt, 5 wrong tries per hour) and records the grant, so pulling strings
 * out of the binary gets nobody PRO. Credentials are managed in the CMS.
 */
export function PrivilegeAuthDialog({
    visible,
    onClose,
    onSuccess,
}: {
    visible: boolean;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { t } = useTranslation();
    const [user, setUser] = useState("");
    const [pass, setPass] = useState("");
    const [hidden, setHidden] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const canSubmit = user.trim().length > 0 && pass.length > 0 && !busy;

    const reset = () => {
        setUser("");
        setPass("");
        setError(null);
        setBusy(false);
    };

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        setError(null);
        const res = await redeemPrivilege(user.trim(), pass);
        setBusy(false);
        if (res.ok) {
            reset();
            onSuccess();
            return;
        }
        setError(res.error === "too_many_attempts" ? t("priv.too_many") : t("priv.invalid"));
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            {/* `behavior` was undefined on Android, which makes
                KeyboardAvoidingView a no-op — and `statusBarTranslucent` stops
                the activity's own adjustResize from reaching inside the modal,
                so nothing moved and the keyboard sat on top of both fields.
                Padding on both platforms lifts a bottom-anchored sheet. */}
            <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
                <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : () => { reset(); onClose(); }} />
                <View style={styles.sheet}>
                    <View style={styles.handle} />
                    <Text style={styles.title}>Privilege Authenticator</Text>
                    <TextInput
                        value={user}
                        onChangeText={setUser}
                        placeholder={t("priv.username")}
                        placeholderTextColor="rgba(255,255,255,0.45)"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.input}
                        returnKeyType="next"
                    />
                    <View>
                        <TextInput
                            value={pass}
                            onChangeText={setPass}
                            placeholder={t("priv.password")}
                            placeholderTextColor="rgba(255,255,255,0.45)"
                            secureTextEntry={hidden}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={[styles.input, { paddingRight: 48 }]}
                            onSubmitEditing={submit}
                            returnKeyType="done"
                        />
                        <Pressable onPress={() => setHidden((h) => !h)} style={styles.eye} hitSlop={8}>
                            <Ionicons name={hidden ? "eye-off-outline" : "eye-outline"} size={20} color="rgba(255,255,255,0.5)" />
                        </Pressable>
                    </View>
                    {!!error && <Text style={styles.error}>{error}</Text>}
                    <Pressable onPress={submit} disabled={!canSubmit} style={[styles.button, !canSubmit && styles.buttonOff]}>
                        {busy ? <ActivityIndicator color="#fff" /> : <Text style={[styles.buttonText, !canSubmit && { opacity: 0.4 }]}>{t("common.continue")}</Text>}
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
    sheet: {
        backgroundColor: "#141019",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Platform.OS === "ios" ? 40 : 28,
        gap: 14,
    },
    handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)", marginBottom: 6 },
    title: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 4 },
    input: {
        height: 52,
        borderRadius: 12,
        paddingHorizontal: 14,
        color: "#fff",
        fontSize: 15,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
    },
    eye: { position: "absolute", right: 14, top: 16 },
    error: { color: "#FF6B6B", fontSize: 13 },
    button: { height: 52, borderRadius: 14, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", marginTop: 6 },
    buttonOff: { backgroundColor: "rgba(255,255,255,0.10)" },
    buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
