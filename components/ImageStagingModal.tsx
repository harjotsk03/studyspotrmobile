import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";
import {
  ChevronLeft,
  ChevronRight,
  Crop,
  X,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const THUMB_S = 68;
const MIN_CROP = 48;
const HANDLE_RADIUS = 28;
const HANDLE_DOT = 18;

type CropBox = { x: number; y: number; w: number; h: number };

type Props = {
  visible: boolean;
  images: ImagePickerAsset[];
  initialIndex?: number;
  onConfirm: (images: ImagePickerAsset[]) => void;
  onCancel: () => void;
};

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

function getHandle(tx: number, ty: number, b: CropBox): string {
  const d = (x1: number, y1: number, x2: number, y2: number) =>
    Math.hypot(x1 - x2, y1 - y2);
  if (d(tx, ty, b.x, b.y) < HANDLE_RADIUS) return "tl";
  if (d(tx, ty, b.x + b.w, b.y) < HANDLE_RADIUS) return "tr";
  if (d(tx, ty, b.x, b.y + b.h) < HANDLE_RADIUS) return "bl";
  if (d(tx, ty, b.x + b.w, b.y + b.h) < HANDLE_RADIUS) return "br";
  if (tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h)
    return "move";
  return "";
}

function applyDrag(
  handle: string,
  s: CropBox,
  dx: number,
  dy: number,
  bw: number,
  bh: number,
): CropBox {
  switch (handle) {
    case "move":
      return { ...s, x: clamp(s.x + dx, 0, bw - s.w), y: clamp(s.y + dy, 0, bh - s.h) };
    case "tl": {
      const nx = clamp(s.x + dx, 0, s.x + s.w - MIN_CROP);
      const ny = clamp(s.y + dy, 0, s.y + s.h - MIN_CROP);
      return { x: nx, y: ny, w: s.w - (nx - s.x), h: s.h - (ny - s.y) };
    }
    case "tr": {
      const nw = clamp(s.w + dx, MIN_CROP, bw - s.x);
      const ny = clamp(s.y + dy, 0, s.y + s.h - MIN_CROP);
      return { x: s.x, y: ny, w: nw, h: s.h - (ny - s.y) };
    }
    case "bl": {
      const nx = clamp(s.x + dx, 0, s.x + s.w - MIN_CROP);
      const nh = clamp(s.h + dy, MIN_CROP, bh - s.y);
      return { x: nx, y: s.y, w: s.w - (nx - s.x), h: nh };
    }
    case "br": {
      const nw = clamp(s.w + dx, MIN_CROP, bw - s.x);
      const nh = clamp(s.h + dy, MIN_CROP, bh - s.y);
      return { x: s.x, y: s.y, w: nw, h: nh };
    }
    default:
      return s;
  }
}

export default function ImageStagingModal({
  visible,
  images: initial,
  initialIndex = 0,
  onConfirm,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  const [staged, setStaged] = useState<ImagePickerAsset[]>([]);
  const [selected, setSelected] = useState(0);
  const [cropping, setCropping] = useState(false);
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0, y: 0, w: 0, h: 0 });
  const [applying, setApplying] = useState(false);

  const cropBoxRef = useRef<CropBox>({ x: 0, y: 0, w: 0, h: 0 });
  const imgDimsRef = useRef({ w: 1, h: 1 });
  const gestureRef = useRef({ handle: "", start: { x: 0, y: 0, w: 0, h: 0 } as CropBox });

  useEffect(() => {
    cropBoxRef.current = cropBox;
  }, [cropBox]);

  useEffect(() => {
    if (!visible) return;
    setStaged([...initial]);
    setSelected(Math.min(initialIndex, Math.max(0, initial.length - 1)));
    setCropping(false);
    setApplying(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = staged[selected] as ImagePickerAsset | undefined;

  const imgDisplay = useMemo(() => {
    if (!current) return { w: 1, h: 1 };
    const maxW = SCREEN_W - 32;
    const maxH = SCREEN_H - insets.top - insets.bottom - 200;
    const iw = current.width || 1;
    const ih = current.height || 1;
    const scale = Math.min(maxW / iw, maxH / ih, 1);
    return { w: Math.round(iw * scale), h: Math.round(ih * scale) };
  }, [current, insets.top, insets.bottom]);

  useEffect(() => {
    imgDimsRef.current = imgDisplay;
  }, [imgDisplay]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          const handle = getHandle(locationX, locationY, cropBoxRef.current);
          gestureRef.current = { handle, start: { ...cropBoxRef.current } };
        },
        onPanResponderMove: (_, gs) => {
          const { handle, start } = gestureRef.current;
          if (!handle) return;
          const { w: bw, h: bh } = imgDimsRef.current;
          setCropBox(applyDrag(handle, start, gs.dx, gs.dy, bw, bh));
        },
        onPanResponderRelease: () => {
          gestureRef.current.handle = "";
        },
      }),
    [],
  );

  const startCrop = useCallback(() => {
    setCropBox({ x: 0, y: 0, w: imgDisplay.w, h: imgDisplay.h });
    cropBoxRef.current = { x: 0, y: 0, w: imgDisplay.w, h: imgDisplay.h };
    setCropping(true);
  }, [imgDisplay]);

  const cancelCrop = useCallback(() => setCropping(false), []);

  const applyCrop = useCallback(async () => {
    if (!current) return;
    setApplying(true);
    try {
      const { w: dw, h: dh } = imgDimsRef.current;
      const box = cropBoxRef.current;
      const sx = (current.width || 1) / dw;
      const sy = (current.height || 1) / dh;

      const originX = Math.round(Math.max(0, box.x * sx));
      const originY = Math.round(Math.max(0, box.y * sy));
      const width = Math.round(
        Math.min(box.w * sx, (current.width || 1) - originX),
      );
      const height = Math.round(
        Math.min(box.h * sy, (current.height || 1) - originY),
      );
      if (width < 10 || height < 10) return;

      const result = await manipulateAsync(
        current.uri,
        [{ crop: { originX, originY, width, height } }],
        { format: SaveFormat.JPEG, compress: 0.85 },
      );

      setStaged((prev) =>
        prev.map((img, i) =>
          i === selected
            ? { ...img, uri: result.uri, width: result.width, height: result.height }
            : img,
        ),
      );
      setCropping(false);
    } catch {
      setCropping(false);
    } finally {
      setApplying(false);
    }
  }, [current, selected]);

  const moveImage = useCallback(
    (dir: -1 | 1) => {
      const to = selected + dir;
      if (to < 0 || to >= staged.length) return;
      setStaged((prev) => {
        const next = [...prev];
        [next[selected], next[to]] = [next[to], next[selected]];
        return next;
      });
      setSelected(to);
    },
    [selected, staged.length],
  );

  const removeImage = useCallback(
    (idx: number) => {
      const next = staged.filter((_, i) => i !== idx);
      if (next.length === 0) {
        onCancel();
        return;
      }
      setStaged(next);
      setSelected((s) => Math.min(s, next.length - 1));
    },
    [staged, onCancel],
  );

  /* ─── Crop & preview share a single Modal ─── */

  const { w: dw, h: dh } = imgDisplay;
  const b = cropBox;
  const thirdW = b.w / 3;
  const thirdH = b.h / 3;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={["portrait"]}
    >
      {cropping && current ? (
        /* ─── Crop view (plain View, no nested Modal) ─── */
        <View style={[styles.cropRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.cropHeader}>
            <Pressable onPress={cancelCrop} hitSlop={12}>
              <Text style={styles.cropHeaderBtn}>Cancel</Text>
            </Pressable>
            <Text style={styles.cropHeaderTitle}>Crop</Text>
            <Pressable onPress={() => void applyCrop()} hitSlop={12} disabled={applying}>
              {applying ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.cropHeaderBtn}>Apply</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.cropBody}>
            <View style={{ width: dw, height: dh, alignSelf: "center" }}>
              <Image
                source={{ uri: current.uri }}
                style={{ width: dw, height: dh }}
                resizeMode="cover"
              />

              {/* Dark overlays */}
              <View style={[styles.darkOverlay, { top: 0, left: 0, right: 0, height: b.y }]} />
              <View
                style={[styles.darkOverlay, { top: b.y + b.h, left: 0, right: 0, bottom: 0 }]}
              />
              <View
                style={[styles.darkOverlay, { top: b.y, left: 0, width: b.x, height: b.h }]}
              />
              <View
                style={[
                  styles.darkOverlay,
                  { top: b.y, left: b.x + b.w, right: 0, height: b.h },
                ]}
              />

              {/* Crop frame */}
              <View
                style={[
                  styles.cropFrame,
                  { left: b.x, top: b.y, width: b.w, height: b.h },
                ]}
              />

              {/* Grid lines (rule of thirds) */}
              <View
                style={[styles.gridH, { top: b.y + thirdH, left: b.x, width: b.w }]}
              />
              <View
                style={[styles.gridH, { top: b.y + thirdH * 2, left: b.x, width: b.w }]}
              />
              <View
                style={[styles.gridV, { left: b.x + thirdW, top: b.y, height: b.h }]}
              />
              <View
                style={[styles.gridV, { left: b.x + thirdW * 2, top: b.y, height: b.h }]}
              />

              {/* Corner handles */}
              {(
                [
                  [b.x, b.y],
                  [b.x + b.w, b.y],
                  [b.x, b.y + b.h],
                  [b.x + b.w, b.y + b.h],
                ] as [number, number][]
              ).map(([hx, hy], i) => (
                <View
                  key={i}
                  style={[
                    styles.handleDot,
                    {
                      left: hx - HANDLE_DOT / 2,
                      top: hy - HANDLE_DOT / 2,
                    },
                  ]}
                />
              ))}

              {/* Gesture overlay — covers the image area, blocks swipe-to-dismiss */}
              <View
                {...panResponder.panHandlers}
                style={StyleSheet.absoluteFill}
                collapsable={false}
              />
            </View>
          </View>
        </View>
      ) : (
        /* ─── Preview mode ─── */
        <View style={[styles.root, { paddingTop: Math.max(insets.top, 12) }]}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onCancel} hitSlop={12}>
              <Text style={styles.headerCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Edit photos</Text>
            <Pressable
              onPress={() => onConfirm(staged)}
              hitSlop={12}
              style={styles.addBtn}
            >
              <Text style={styles.addBtnText}>
                Add{staged.length > 1 ? ` (${staged.length})` : ""}
              </Text>
            </Pressable>
          </View>

          {/* Preview */}
          <View style={styles.previewWrap}>
            {current ? (
              <>
                <Image
                  source={{ uri: current.uri }}
                  style={[
                    styles.previewImg,
                    { width: imgDisplay.w, height: imgDisplay.h },
                  ]}
                  resizeMode="contain"
                />
                <Pressable style={styles.cropOverlayBtn} onPress={startCrop}>
                  <Crop size={16} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.cropOverlayText}>Crop</Text>
                </Pressable>
              </>
            ) : null}
          </View>

          {/* Thumbnail strip */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbStrip}
            style={styles.thumbScroll}
          >
            {staged.map((img, idx) => (
              <Pressable
                key={`${img.uri}-${idx}`}
                onPress={() => setSelected(idx)}
                style={[
                  styles.thumbBox,
                  selected === idx && styles.thumbSelected,
                ]}
              >
                <Image
                  source={{ uri: img.uri }}
                  style={styles.thumbImg}
                  resizeMode="cover"
                />
                <Text style={styles.thumbIdx}>{idx + 1}</Text>
                <Pressable
                  style={styles.thumbRemove}
                  onPress={() => removeImage(idx)}
                  hitSlop={6}
                >
                  <X size={10} color="#fff" strokeWidth={3} />
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>

          {/* Action bar */}
          <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable
              onPress={() => moveImage(-1)}
              disabled={selected === 0}
              style={[styles.actionBtn, selected === 0 && styles.actionDisabled]}
            >
              <ChevronLeft
                size={20}
                color={selected === 0 ? "#aaa" : Colors.dark}
                strokeWidth={2}
              />
              <Text
                style={[styles.actionLabel, selected === 0 && styles.actionLabelDisabled]}
              >
                Move left
              </Text>
            </Pressable>

            <Pressable onPress={startCrop} style={styles.actionBtn}>
              <Crop size={18} color={Colors.dark} strokeWidth={2} />
              <Text style={styles.actionLabel}>Crop</Text>
            </Pressable>

            <Pressable
              onPress={() => moveImage(1)}
              disabled={selected === staged.length - 1}
              style={[
                styles.actionBtn,
                selected === staged.length - 1 && styles.actionDisabled,
              ]}
            >
              <Text
                style={[
                  styles.actionLabel,
                  selected === staged.length - 1 && styles.actionLabelDisabled,
                ]}
              >
                Move right
              </Text>
              <ChevronRight
                size={20}
                color={selected === staged.length - 1 ? "#aaa" : Colors.dark}
                strokeWidth={2}
              />
            </Pressable>
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  /* ── Preview mode ── */
  root: { flex: 1, backgroundColor: Colors.light },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerCancel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 16,
    color: Colors.primary,
  },
  headerTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: "#fff",
  },

  previewWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f4f4",
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: "hidden",
  },
  previewImg: { borderRadius: 10 },
  cropOverlayBtn: {
    position: "absolute",
    bottom: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  cropOverlayText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#fff",
  },

  thumbScroll: { flexGrow: 0, marginTop: 14 },
  thumbStrip: { paddingHorizontal: 16, gap: 10 },
  thumbBox: {
    width: THUMB_S,
    height: THUMB_S,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  thumbSelected: { borderColor: Colors.primary },
  thumbImg: { width: "100%", height: "100%" },
  thumbIdx: {
    position: "absolute",
    bottom: 3,
    left: 5,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 11,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  thumbRemove: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  actionBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingTop: 14,
    paddingHorizontal: 16,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  actionDisabled: { opacity: 0.4 },
  actionLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 14,
    color: Colors.dark,
  },
  actionLabelDisabled: { color: "#aaa" },

  /* ── Crop mode ── */
  cropRoot: { flex: 1, backgroundColor: "#111" },
  cropHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cropHeaderBtn: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 16,
    color: "#fff",
  },
  cropHeaderTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: "#fff",
  },
  cropBody: { flex: 1, justifyContent: "center", alignItems: "center" },
  darkOverlay: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  cropFrame: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  gridH: { position: "absolute", height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.35)" },
  gridV: { position: "absolute", width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.35)" },
  handleDot: {
    position: "absolute",
    width: HANDLE_DOT,
    height: HANDLE_DOT,
    borderRadius: HANDLE_DOT / 2,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: Colors.primary,
  },
});
