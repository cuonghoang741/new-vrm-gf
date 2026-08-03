/**
 * i18n resources — 10 ngôn ngữ y hệt Yuuki: en, vi, ja, zh, ko, es, pt, de, fr, it.
 *
 * Cách thêm chữ: thêm KEY vào `en` (bảng gốc), rồi thêm bản dịch tương ứng vào
 * 9 ngôn ngữ còn lại. Thiếu key ở ngôn ngữ nào thì tự rơi về `en` (fallbackLng).
 *
 * Đây là bộ khởi đầu (màn Language + common). Chuỗi của từng màn (Onboarding,
 * SignIn, Play, các sheet…) được bổ sung dần theo phase localize.
 */

export const SUPPORTED = [
    "en", "vi", "ja", "zh", "ko", "es", "pt", "de", "fr", "it",
] as const;
export type SupportedLang = (typeof SUPPORTED)[number];

/** Tên bản địa + cờ, dùng cho màn chọn ngôn ngữ. */
export const LANGUAGE_META: Record<SupportedLang, { name: string; flag: string }> = {
    en: { name: "English", flag: "🇬🇧" },
    vi: { name: "Tiếng Việt", flag: "🇻🇳" },
    ja: { name: "日本語", flag: "🇯🇵" },
    zh: { name: "中文", flag: "🇨🇳" },
    ko: { name: "한국어", flag: "🇰🇷" },
    es: { name: "Español", flag: "🇪🇸" },
    pt: { name: "Português", flag: "🇵🇹" },
    de: { name: "Deutsch", flag: "🇩🇪" },
    fr: { name: "Français", flag: "🇫🇷" },
    it: { name: "Italiano", flag: "🇮🇹" },
};

type Dict = Record<string, string>;

const en: Dict = {
    "lang.title": "Choose your language",
    "lang.subtitle": "You can change this anytime in Settings",
    "common.continue": "Continue",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.ok": "OK",
    "common.back": "Back",
    "common.next": "Next",
    "common.done": "Done",
    "common.skip": "Skip",
    "common.close": "Close",
};

const vi: Dict = {
    "lang.title": "Chọn ngôn ngữ",
    "lang.subtitle": "Bạn có thể đổi lại bất cứ lúc nào trong Cài đặt",
    "common.continue": "Tiếp tục",
    "common.cancel": "Huỷ",
    "common.save": "Lưu",
    "common.ok": "OK",
    "common.back": "Quay lại",
    "common.next": "Tiếp",
    "common.done": "Xong",
    "common.skip": "Bỏ qua",
    "common.close": "Đóng",
};

const ja: Dict = {
    "lang.title": "言語を選択",
    "lang.subtitle": "設定でいつでも変更できます",
    "common.continue": "続ける",
    "common.cancel": "キャンセル",
    "common.save": "保存",
    "common.ok": "OK",
    "common.back": "戻る",
    "common.next": "次へ",
    "common.done": "完了",
    "common.skip": "スキップ",
    "common.close": "閉じる",
};

const zh: Dict = {
    "lang.title": "选择语言",
    "lang.subtitle": "你可以随时在设置中更改",
    "common.continue": "继续",
    "common.cancel": "取消",
    "common.save": "保存",
    "common.ok": "确定",
    "common.back": "返回",
    "common.next": "下一步",
    "common.done": "完成",
    "common.skip": "跳过",
    "common.close": "关闭",
};

const ko: Dict = {
    "lang.title": "언어 선택",
    "lang.subtitle": "설정에서 언제든지 변경할 수 있어요",
    "common.continue": "계속",
    "common.cancel": "취소",
    "common.save": "저장",
    "common.ok": "확인",
    "common.back": "뒤로",
    "common.next": "다음",
    "common.done": "완료",
    "common.skip": "건너뛰기",
    "common.close": "닫기",
};

const es: Dict = {
    "lang.title": "Elige tu idioma",
    "lang.subtitle": "Puedes cambiarlo cuando quieras en Ajustes",
    "common.continue": "Continuar",
    "common.cancel": "Cancelar",
    "common.save": "Guardar",
    "common.ok": "OK",
    "common.back": "Atrás",
    "common.next": "Siguiente",
    "common.done": "Listo",
    "common.skip": "Omitir",
    "common.close": "Cerrar",
};

const pt: Dict = {
    "lang.title": "Escolha o seu idioma",
    "lang.subtitle": "Pode alterar a qualquer momento nas Definições",
    "common.continue": "Continuar",
    "common.cancel": "Cancelar",
    "common.save": "Guardar",
    "common.ok": "OK",
    "common.back": "Voltar",
    "common.next": "Seguinte",
    "common.done": "Concluído",
    "common.skip": "Ignorar",
    "common.close": "Fechar",
};

const de: Dict = {
    "lang.title": "Sprache wählen",
    "lang.subtitle": "Du kannst dies jederzeit in den Einstellungen ändern",
    "common.continue": "Weiter",
    "common.cancel": "Abbrechen",
    "common.save": "Speichern",
    "common.ok": "OK",
    "common.back": "Zurück",
    "common.next": "Weiter",
    "common.done": "Fertig",
    "common.skip": "Überspringen",
    "common.close": "Schließen",
};

const fr: Dict = {
    "lang.title": "Choisissez votre langue",
    "lang.subtitle": "Vous pouvez changer à tout moment dans les Réglages",
    "common.continue": "Continuer",
    "common.cancel": "Annuler",
    "common.save": "Enregistrer",
    "common.ok": "OK",
    "common.back": "Retour",
    "common.next": "Suivant",
    "common.done": "Terminé",
    "common.skip": "Passer",
    "common.close": "Fermer",
};

const it: Dict = {
    "lang.title": "Scegli la lingua",
    "lang.subtitle": "Puoi cambiarla quando vuoi nelle Impostazioni",
    "common.continue": "Continua",
    "common.cancel": "Annulla",
    "common.save": "Salva",
    "common.ok": "OK",
    "common.back": "Indietro",
    "common.next": "Avanti",
    "common.done": "Fatto",
    "common.skip": "Salta",
    "common.close": "Chiudi",
};

export const resources: Record<SupportedLang, { translation: Dict }> = {
    en: { translation: en },
    vi: { translation: vi },
    ja: { translation: ja },
    zh: { translation: zh },
    ko: { translation: ko },
    es: { translation: es },
    pt: { translation: pt },
    de: { translation: de },
    fr: { translation: fr },
    it: { translation: it },
};
