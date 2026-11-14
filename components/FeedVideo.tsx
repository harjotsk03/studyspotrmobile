import { useEffect } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  shouldPlay?: boolean;
  isMuted?: boolean;
  isLooping?: boolean;
  nativeControls?: boolean;
  contentFit?: "contain" | "cover" | "fill";
};

export default function FeedVideo({
  uri,
  style,
  shouldPlay = false,
  isMuted = false,
  isLooping = true,
  nativeControls = false,
  contentFit = "cover",
}: Props) {
  const player = useVideoPlayer(uri, (next) => {
    next.loop = isLooping;
    next.muted = isMuted;
  });

  useEffect(() => {
    player.loop = isLooping;
  }, [isLooping, player]);

  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (shouldPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, shouldPlay]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit={contentFit}
      nativeControls={nativeControls}
      pointerEvents={nativeControls ? "auto" : "none"}
    />
  );
}
