import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, PanResponder, StyleSheet, View } from "react-native";

/** Touches starting this close to the left edge belong to the iOS back swipe. */
const EDGE_GUARD = 20;

type Props<T extends string> = {
  order: readonly T[];
  active: T;
  onChange: (tab: T) => void;
  /** Renders one tab's content. Every tab is mounted side by side so the
   * neighbouring tab can be peeked at while dragging. */
  renderPane: (tab: T, isActive: boolean) => ReactNode;
  /** True while a horizontal drag owns the touch (lock vertical scrolling). */
  onSwipeActiveChange?: (active: boolean) => void;
};

/**
 * Horizontal pager for profile tabs. The pages follow the finger 1:1 so you
 * can half-swipe either way and peek at the neighbouring tab, then settle on
 * whichever is nearer (or the one a flick points to) with a smooth,
 * non-bouncy ease. Everything above the pager stays put.
 */
export default function SwipeTabPager<T extends string>({
  order,
  active,
  onChange,
  renderPane,
  onSwipeActiveChange,
}: Props<T>) {
  const count = order.length;
  const activeIndex = Math.max(0, order.indexOf(active));

  const [width, setWidth] = useState(0);
  // Neighbouring tabs are only mounted while a drag / slide is in progress;
  // at rest the pager is just the active tab in normal layout.
  const [moving, setMoving] = useState(false);

  const pos = useRef(new Animated.Value(activeIndex)).current;
  const posRef = useRef(activeIndex);
  useEffect(() => {
    const id = pos.addListener(({ value }) => {
      posRef.current = value;
    });
    return () => pos.removeListener(id);
  }, [pos]);

  const widthRef = useRef(0);
  widthRef.current = width;
  const orderRef = useRef(order);
  orderRef.current = order;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const swipeCbRef = useRef(onSwipeActiveChange);
  swipeCbRef.current = onSwipeActiveChange;

  const animateTo = useCallback(
    (index: number) => {
      setMoving(true);
      Animated.spring(pos, {
        toValue: index,
        stiffness: 260,
        damping: 30,
        mass: 1,
        overshootClamping: true,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMoving(false);
      });
    },
    [pos],
  );

  // Follow external tab changes (taps on the tab bar).
  useEffect(() => {
    if (Math.abs(posRef.current - activeIndex) < 0.001) return;
    animateTo(activeIndex);
  }, [activeIndex, animateTo]);

  const baseRef = useRef(0);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (e, g) => {
          const startX = e.nativeEvent.pageX - g.dx;
          return (
            startX > EDGE_GUARD &&
            Math.abs(g.dx) > 8 &&
            Math.abs(g.dx) > Math.abs(g.dy) * 1.5
          );
        },
        onPanResponderGrant: () => {
          pos.stopAnimation();
          baseRef.current = posRef.current;
          setMoving(true);
          swipeCbRef.current?.(true);
        },
        onPanResponderMove: (_, g) => {
          const w = widthRef.current || 1;
          const max = orderRef.current.length - 1;
          let next = baseRef.current - g.dx / w;
          // Soft resistance past the first / last tab.
          if (next < 0) next = next * 0.25;
          else if (next > max) next = max + (next - max) * 0.25;
          pos.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          swipeCbRef.current?.(false);
          const w = widthRef.current || 1;
          const max = orderRef.current.length - 1;
          // Project the release a little along the flick, then snap.
          const projected = posRef.current - (g.vx * 220) / w;
          const target = Math.min(max, Math.max(0, Math.round(projected)));
          if (target !== activeIndexRef.current) {
            onChangeRef.current(orderRef.current[target]);
          }
          animateTo(target);
        },
        onPanResponderTerminate: () => {
          swipeCbRef.current?.(false);
          animateTo(activeIndexRef.current);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [pos, animateTo],
  );

  // The active pane sits in normal flow (so the pager is exactly as tall as
  // it), neighbours are absolutely placed one page to either side. Sliding
  // the whole track by (active - pos) pages keeps every pane at (i - pos).
  const translateX = useMemo(
    () =>
      width > 0
        ? pos.interpolate({
            inputRange: [activeIndex - 1, activeIndex, activeIndex + 1],
            outputRange: [width, 0, -width],
          })
        : 0,
    [pos, activeIndex, width],
  );

  return (
    <View
      style={styles.clip}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      {...pan.panHandlers}
    >
      {width > 0 ? (
        <Animated.View style={{ transform: [{ translateX }] }}>
          {order.map((tab, i) => {
            const isActive = tab === active;
            if (!isActive && !moving) return null;
            return (
              <View
                key={tab}
                pointerEvents={isActive ? "auto" : "none"}
                style={
                  isActive
                    ? { width }
                    : {
                        position: "absolute",
                        top: 0,
                        left: (i - activeIndex) * width,
                        width,
                      }
                }
              >
                {renderPane(tab, isActive)}
              </View>
            );
          })}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    // Fill the rest of the screen below the tabs so the whole area is
    // swipeable, even when the tab has little or no content.
    flexGrow: 1,
    overflow: "hidden",
  },
});
