import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Colors } from "../../constants/Colors";
import { Fonts } from "../../constants/Fonts";
import { MAX_ONBOARDING_TAGS } from "../../constants/onboardingOptions";

type Props = {
  title: string;
  subtitle: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
};

export default function ChipPicker({
  title,
  subtitle,
  options,
  selected,
  onChange,
}: Props) {
  const [custom, setCustom] = useState("");
  const atLimit = selected.length >= MAX_ONBOARDING_TAGS;

  const toggle = (tag: string) => {
    if (selected.includes(tag)) {
      onChange(selected.filter((item) => item !== tag));
      return;
    }
    if (atLimit) return;
    onChange([...selected, tag]);
  };

  const addCustom = () => {
    const tag = custom.trim();
    if (!tag || atLimit) return;
    if (selected.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      setCustom("");
      return;
    }
    onChange([...selected, tag]);
    setCustom("");
  };

  const visibleOptions = Array.from(new Set([...options, ...selected]));

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.chips}>
        {visibleOptions.map((tag) => {
          const active = selected.includes(tag);
          return (
            <Pressable
              key={tag}
              onPress={() => toggle(tag)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {tag}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder={atLimit ? "Maximum of 5" : "Add your own"}
          placeholderTextColor="#999"
          value={custom}
          editable={!atLimit}
          onChangeText={setCustom}
          onSubmitEditing={addCustom}
          returnKeyType="done"
        />
        <Pressable
          onPress={addCustom}
          disabled={atLimit || !custom.trim()}
          style={[
            styles.addButton,
            (atLimit || !custom.trim()) && styles.addButtonDisabled,
          ]}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 22,
  },
  title: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
  },
  subtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
    marginTop: 2,
    marginBottom: 12,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E2E2",
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 13,
    color: Colors.dark,
  },
  chipTextActive: {
    color: "#fff",
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  addInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: Colors.dark,
  },
  addButton: {
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.dark,
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addButtonText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 14,
    color: "#fff",
  },
});
