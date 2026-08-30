import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { LEGAL_LAST_UPDATED } from "../constants/Legal";
import {
  PRIVACY_POLICY,
  TERMS_OF_SERVICE,
  type LegalSection,
} from "../constants/legalDocuments";
import Button from "./Button";

export type LegalConsentMode = "accept" | "view";

type TabKey = "terms" | "privacy";

type Props = {
  visible: boolean;
  mode?: LegalConsentMode;
  initialTab?: TabKey;
  onAccepted?: () => void;
  onDismiss: () => void;
};

const SCROLL_END_PADDING = 40;

function isScrolledToEnd(nativeEvent: NativeScrollEvent) {
  const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
  return (
    layoutMeasurement.height + contentOffset.y >=
    contentSize.height - SCROLL_END_PADDING
  );
}

function LegalDocument({ sections }: { sections: LegalSection[] }) {
  return (
    <View>
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph.slice(0, 48)} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function LegalConsentModal({
  visible,
  mode = "accept",
  initialTab = "terms",
  onAccepted,
  onDismiss,
}: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [termsRead, setTermsRead] = useState(false);
  const [privacyRead, setPrivacyRead] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);

  const isAccept = mode === "accept";

  useEffect(() => {
    if (!visible) return;
    setTab(initialTab);
    if (isAccept) {
      setTermsRead(false);
      setPrivacyRead(false);
    }
  }, [visible, initialTab, isAccept]);

  const markCurrentRead = useCallback(() => {
    if (tab === "terms") setTermsRead(true);
    else setPrivacyRead(true);
  }, [tab]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isScrolledToEnd(event.nativeEvent)) markCurrentRead();
  };

  const handleContentSizeChange = (_w: number, height: number) => {
    if (viewportHeight > 0 && height <= viewportHeight + SCROLL_END_PADDING) {
      markCurrentRead();
    }
  };

  const currentRead = tab === "terms" ? termsRead : privacyRead;
  const canOpenPrivacy = !isAccept || termsRead;

  const primaryLabel = !isAccept
    ? "Close"
    : tab === "terms"
      ? "Continue"
      : "Accept";

  const primaryDisabled = isAccept && !currentRead;

  const handlePrimary = () => {
    if (!isAccept) {
      onDismiss();
      return;
    }
    if (!currentRead) return;
    if (tab === "terms") {
      setTab("privacy");
      return;
    }
    onAccepted?.();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View
        style={[
          styles.sheet,
          { paddingTop: Math.max(insets.top, 16), paddingBottom: insets.bottom },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>
              {isAccept ? "Review and accept" : "Legal"}
            </Text>
            <Text style={styles.updated}>Last updated {LEGAL_LAST_UPDATED}</Text>
          </View>
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.closeButton}
          >
            <X size={22} color={Colors.dark} />
          </Pressable>
        </View>

        {isAccept ? (
          <Text style={styles.intro}>
            Scroll to the bottom of each document, then accept to create your
            account or continue with Google or Apple.
          </Text>
        ) : null}

        <View style={styles.tabs}>
          <Pressable
            onPress={() => setTab("terms")}
            style={[styles.tab, tab === "terms" && styles.tabActive]}
          >
            <Text
              style={[styles.tabLabel, tab === "terms" && styles.tabLabelActive]}
            >
              Terms of Service
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (canOpenPrivacy) setTab("privacy");
            }}
            style={[
              styles.tab,
              tab === "privacy" && styles.tabActive,
              !canOpenPrivacy && styles.tabLocked,
            ]}
          >
            <Text
              style={[
                styles.tabLabel,
                tab === "privacy" && styles.tabLabelActive,
                !canOpenPrivacy && styles.tabLabelLocked,
              ]}
            >
              Privacy Policy
            </Text>
          </Pressable>
        </View>

        <ScrollView
          key={tab}
          style={styles.scroller}
          contentContainerStyle={styles.scrollerContent}
          onLayout={(event) =>
            setViewportHeight(event.nativeEvent.layout.height)
          }
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator
        >
          <LegalDocument
            sections={tab === "terms" ? TERMS_OF_SERVICE : PRIVACY_POLICY}
          />
          {isAccept && !currentRead ? (
            <Text style={styles.scrollHint}>Keep scrolling to continue</Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {isAccept ? (
            <Text style={styles.progress}>
              {tab === "terms" ? "1 of 2" : "2 of 2"}
              {currentRead ? " · reached the end" : " · scroll to the end"}
            </Text>
          ) : null}
          <Button
            label={primaryLabel}
            variant="default"
            disabled={primaryDisabled}
            onPress={handlePrimary}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 26,
    color: Colors.dark,
  },
  updated: {
    marginTop: 4,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  intro: {
    marginTop: 12,
    paddingHorizontal: 22,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 20,
    color: "#666",
  },
  tabs: {
    marginTop: 16,
    marginHorizontal: 22,
    flexDirection: "row",
    gap: 8,
    padding: 4,
    borderRadius: 10,
    backgroundColor: "#EDEDED",
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#fff",
  },
  tabLocked: {
    opacity: 0.55,
  },
  tabLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#777",
  },
  tabLabelActive: {
    color: Colors.dark,
  },
  tabLabelLocked: {
    color: "#999",
  },
  scroller: {
    flex: 1,
    marginTop: 8,
  },
  scrollerContent: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 28,
  },
  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.dark,
    marginBottom: 8,
  },
  paragraph: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 21,
    color: "#444",
    marginBottom: 10,
  },
  scrollHint: {
    marginTop: 8,
    textAlign: "center",
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: Colors.accent,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E2E2",
    backgroundColor: Colors.light,
  },
  progress: {
    textAlign: "center",
    marginBottom: 10,
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#888",
  },
});
