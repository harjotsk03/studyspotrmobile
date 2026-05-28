import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { Heart } from "lucide-react-native";
import { Colors } from "../constants/Colors";

type Props = {
  /** Current like state. The component pulses whenever this transitions
   * from `false` → `true`. Unliking is intentionally silent so the gesture
   * doesn't draw the eye twice on undo. */
  liked: boolean;
  size?: number;
};

/**
 * Heart icon that gives a brief scale-pulse the moment a comment becomes
 * liked. Self-contained so it can be reused per-row in the comments list
 * without the parent having to track an `Animated.Value` per comment.
 *
 * The animation runs on the native driver, so it stays smooth even while
 * the comments list is mid-scroll.
 */
export default function CommentHeart({ liked, size = 20 }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  /** Holds the previous `liked` value across renders so we can fire the
   * pulse only on the false → true transition, never on initial mount and
   * never on an unlike. */
  const prevLikedRef = useRef(liked);

  useEffect(() => {
    if (liked && !prevLikedRef.current) {
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.3,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          bounciness: 14,
          speed: 16,
        }),
      ]).start();
    }
    prevLikedRef.current = liked;
  }, [liked, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Heart
        size={size}
        color={liked ? Colors.accent : "#8a8a8a"}
        strokeWidth={2.2}
        fill={liked ? Colors.accent : "transparent"}
      />
    </Animated.View>
  );
}
