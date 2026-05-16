import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { StudySpot } from "../context/SpotsContext";
import type { RootStackParamList } from "../types/navigation";

/** Full-screen spot detail on the root stack (smooth push; avoids tab switching). */
export function openSpotViewerFromRoot(
  rootNavigation: NativeStackNavigationProp<RootStackParamList>,
  spot: StudySpot,
): void {
  rootNavigation.navigate("SpotViewer", { spot });
}

/** From Profile tab (nested under MainTabs): resolve root navigator then push SpotViewer. */
export function openSpotViewerFromProfileTab(
  profileStackNavigation: { getParent: () => unknown },
  spot: StudySpot,
): void {
  const tabNav = profileStackNavigation.getParent() as
    | { getParent?: () => unknown }
    | undefined;
  const rootNav = tabNav?.getParent?.() as
    | NativeStackNavigationProp<RootStackParamList>
    | undefined;
  rootNav?.navigate("SpotViewer", { spot });
}
