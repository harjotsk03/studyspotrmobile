import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Colors } from "../../constants/Colors";
import { Fonts } from "../../constants/Fonts";

type Props = {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  optional?: boolean;
};

export default function SearchableSelect({
  label,
  placeholder,
  value,
  options,
  onChange,
  optional = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? options.filter((item) => item.toLowerCase().includes(q))
      : options;
    return pool.slice(0, 8);
  }, [options, query]);

  const customValue = query.trim();
  const showCustom =
    customValue.length >= 2 &&
    !options.some((item) => item.toLowerCase() === customValue.toLowerCase());

  const select = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      {value ? (
        <Pressable
          style={styles.field}
          onPress={() => {
            onChange("");
            setOpen(true);
          }}
        >
          <Text style={styles.innerLabel}>
            {label}
            {optional ? "  · optional" : ""}
          </Text>
          <View style={styles.valueRow}>
            <Text style={styles.selectedText} numberOfLines={1}>
              {value}
            </Text>
            <Text style={styles.clear}>Change</Text>
          </View>
        </Pressable>
      ) : (
        <View style={[styles.field, open && styles.fieldFocused]}>
          <Text style={styles.innerLabel}>
            {label}
            {optional ? "  · optional" : ""}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor="#999"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            autoCorrect={false}
          />
        </View>
      )}

      {open && !value ? (
        <View style={styles.results}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            style={styles.resultsScroll}
          >
            {showCustom ? (
              <Pressable
                style={styles.resultRow}
                onPress={() => select(customValue)}
              >
                <Text style={styles.customLabel}>Use “{customValue}”</Text>
              </Pressable>
            ) : null}
            {filtered.map((item) => (
              <Pressable
                key={item}
                style={styles.resultRow}
                onPress={() => select(item)}
              >
                <Text style={styles.resultText}>{item}</Text>
              </Pressable>
            ))}
            {filtered.length === 0 && !showCustom ? (
              <Text style={styles.empty}>No matches. Type to add your own.</Text>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  field: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
  },
  fieldFocused: {
    borderColor: Colors.primary,
  },
  innerLabel: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#999",
    marginBottom: 2,
  },
  input: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    paddingVertical: 0,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectedText: {
    flex: 1,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
  },
  clear: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: Colors.primary,
  },
  results: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    maxHeight: 220,
  },
  resultsScroll: {
    maxHeight: 220,
  },
  resultRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EFEFEF",
  },
  resultText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
  },
  customLabel: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 15,
    color: Colors.primary,
  },
  empty: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
  },
});
