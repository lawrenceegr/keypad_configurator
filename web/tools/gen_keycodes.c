#include <dt-bindings/zmk/keys.h>
#include <stdio.h>

struct entry {
	const char *mnemonic;
	const char *label;
	const char *group;
	unsigned int code;
};

#define KC(m, label, group) {#m, label, group, (unsigned int)(m)}

static const struct entry entries[] = {
	KC(A, "A", "Letters"), KC(B, "B", "Letters"), KC(C, "C", "Letters"),
	KC(D, "D", "Letters"), KC(E, "E", "Letters"), KC(F, "F", "Letters"),
	KC(G, "G", "Letters"), KC(H, "H", "Letters"), KC(I, "I", "Letters"),
	KC(J, "J", "Letters"), KC(K, "K", "Letters"), KC(L, "L", "Letters"),
	KC(M, "M", "Letters"), KC(N, "N", "Letters"), KC(O, "O", "Letters"),
	KC(P, "P", "Letters"), KC(Q, "Q", "Letters"), KC(R, "R", "Letters"),
	KC(S, "S", "Letters"), KC(T, "T", "Letters"), KC(U, "U", "Letters"),
	KC(V, "V", "Letters"), KC(W, "W", "Letters"), KC(X, "X", "Letters"),
	KC(Y, "Y", "Letters"), KC(Z, "Z", "Letters"),

	KC(N1, "1", "Numbers"), KC(N2, "2", "Numbers"), KC(N3, "3", "Numbers"),
	KC(N4, "4", "Numbers"), KC(N5, "5", "Numbers"), KC(N6, "6", "Numbers"),
	KC(N7, "7", "Numbers"), KC(N8, "8", "Numbers"), KC(N9, "9", "Numbers"),
	KC(N0, "0", "Numbers"),

	KC(KP_N1, "Num 1", "Numpad"), KC(KP_N2, "Num 2", "Numpad"),
	KC(KP_N3, "Num 3", "Numpad"), KC(KP_N4, "Num 4", "Numpad"),
	KC(KP_N5, "Num 5", "Numpad"), KC(KP_N6, "Num 6", "Numpad"),
	KC(KP_N7, "Num 7", "Numpad"), KC(KP_N8, "Num 8", "Numpad"),
	KC(KP_N9, "Num 9", "Numpad"), KC(KP_N0, "Num 0", "Numpad"),
	KC(KP_PLUS, "Num +", "Numpad"), KC(KP_MINUS, "Num -", "Numpad"),
	KC(KP_MULTIPLY, "Num *", "Numpad"), KC(KP_DIVIDE, "Num /", "Numpad"),
	KC(KP_ENTER, "Num Enter", "Numpad"), KC(KP_DOT, "Num .", "Numpad"),
	KC(KP_EQUAL, "Num =", "Numpad"), KC(KP_NUM, "Num Lock", "Numpad"),

	KC(F1, "F1", "Function"), KC(F2, "F2", "Function"), KC(F3, "F3", "Function"),
	KC(F4, "F4", "Function"), KC(F5, "F5", "Function"), KC(F6, "F6", "Function"),
	KC(F7, "F7", "Function"), KC(F8, "F8", "Function"), KC(F9, "F9", "Function"),
	KC(F10, "F10", "Function"), KC(F11, "F11", "Function"), KC(F12, "F12", "Function"),

	KC(ENTER, "Enter", "Editing"), KC(ESC, "Esc", "Editing"),
	KC(BSPC, "Backspace", "Editing"), KC(DEL, "Delete", "Editing"),
	KC(TAB, "Tab", "Editing"), KC(SPACE, "Space", "Editing"),
	KC(CAPS, "Caps Lock", "Editing"), KC(INS, "Insert", "Editing"),

	KC(HOME, "Home", "Navigation"), KC(END, "End", "Navigation"),
	KC(PG_UP, "Page Up", "Navigation"), KC(PG_DN, "Page Down", "Navigation"),
	KC(UP, "Up", "Navigation"), KC(DOWN, "Down", "Navigation"),
	KC(LEFT, "Left", "Navigation"), KC(RIGHT, "Right", "Navigation"),

	KC(LCTRL, "Left Ctrl", "Modifiers"), KC(LSHFT, "Left Shift", "Modifiers"),
	KC(LALT, "Left Alt", "Modifiers"), KC(LGUI, "Left GUI", "Modifiers"),
	KC(RCTRL, "Right Ctrl", "Modifiers"), KC(RSHFT, "Right Shift", "Modifiers"),
	KC(RALT, "Right Alt", "Modifiers"), KC(RGUI, "Right GUI", "Modifiers"),

	KC(MINUS, "-", "Symbols"), KC(EQUAL, "=", "Symbols"),
	KC(LBKT, "[", "Symbols"), KC(RBKT, "]", "Symbols"),
	KC(BSLH, "\\\\", "Symbols"), KC(SEMI, ";", "Symbols"),
	KC(SQT, "'", "Symbols"), KC(GRAVE, "`", "Symbols"),
	KC(COMMA, ",", "Symbols"), KC(DOT, ".", "Symbols"), KC(FSLH, "/", "Symbols"),

	KC(C_MUTE, "Mute", "Media"), KC(C_VOL_UP, "Volume Up", "Media"),
	KC(C_VOL_DN, "Volume Down", "Media"), KC(C_PLAY_PAUSE, "Play / Pause", "Media"),
	KC(C_NEXT, "Next Track", "Media"), KC(C_PREV, "Prev Track", "Media"),
	KC(C_STOP, "Stop", "Media"), KC(C_BRI_UP, "Brightness Up", "Media"),
	KC(C_BRI_DN, "Brightness Down", "Media"),
};

int main(void) {
	printf("export const KEYCODES = [\n");
	for (unsigned int i = 0; i < sizeof(entries) / sizeof(entries[0]); i++) {
		printf("  { code: %u, mnemonic: \"%s\", label: \"%s\", group: \"%s\" },\n",
		       entries[i].code, entries[i].mnemonic, entries[i].label, entries[i].group);
	}
	printf("];\n");
	return 0;
}
