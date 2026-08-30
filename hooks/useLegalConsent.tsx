import { useCallback, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LEGAL_VERSION } from "../constants/Legal";
import LegalConsentModal, {
  type LegalConsentMode,
} from "../components/LegalConsentModal";

const STORAGE_KEY = `legal_consent_${LEGAL_VERSION}`;

async function hasAcceptedCurrentLegal() {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    return value === "1";
  } catch {
    return false;
  }
}

async function persistLegalAcceptance() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Local persistence failed — the user still accepted for this session.
  }
}

export function useLegalConsent() {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<LegalConsentMode>("accept");
  const [initialTab, setInitialTab] = useState<"terms" | "privacy">("terms");
  const resolverRef = useRef<((accepted: boolean) => void) | null>(null);

  const close = useCallback((accepted: boolean) => {
    setVisible(false);
    resolverRef.current?.(accepted);
    resolverRef.current = null;
  }, []);

  const ensureConsent = useCallback(async () => {
    if (await hasAcceptedCurrentLegal()) return true;

    return new Promise<boolean>((resolve) => {
      resolverRef.current = (accepted) => {
        if (accepted) void persistLegalAcceptance();
        resolve(accepted);
      };
      setMode("accept");
      setInitialTab("terms");
      setVisible(true);
    });
  }, []);

  const openDocument = useCallback((tab: "terms" | "privacy") => {
    setMode("view");
    setInitialTab(tab);
    setVisible(true);
  }, []);

  const modal = (
    <LegalConsentModal
      visible={visible}
      mode={mode}
      initialTab={initialTab}
      onAccepted={() => close(true)}
      onDismiss={() => close(false)}
    />
  );

  return { modal, ensureConsent, openDocument };
}
