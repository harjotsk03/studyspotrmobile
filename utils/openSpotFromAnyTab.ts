import type { StudySpot } from "../context/SpotsContext";

/** Navigate to Spots → Spot Detail from Profile stack under Main Tabs. */
export function openSpotFromNestedTabNavigator(
  navigation: { getParent: () => unknown },
  spot: StudySpot,
): void {
  const parent = navigation.getParent() as
    | { navigate?: (name: string, params?: Record<string, unknown>) => void }
    | undefined;
  parent?.navigate?.("Spots", {
    screen: "SpotDetail",
    params: { spot },
  });
}

/** From Root stack (e.g. Public Profile). */
export function openSpotFromRootStack(
  navigation: { navigate?: (name: string, params?: Record<string, unknown>) => void },
  spot: StudySpot,
): void {
  navigation.navigate?.("MainTabs", {
    screen: "Spots",
    params: { screen: "SpotDetail", params: { spot } },
  });
}
