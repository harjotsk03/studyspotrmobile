import {
  CommonActions,
  type NavigationProp,
  type ParamListBase,
} from "@react-navigation/native";
import type { ChatOtherUser } from "./chatApi";

export type NavigateInboxChatThreadPayload = {
  conversationId: string;
  peer?: ChatOtherUser | null;
  draftMessage: string;
};

/** Walk up to the root stack (the one that owns MainTabs). */
function findRootNavigator(
  navigation: NavigationProp<ParamListBase>,
): NavigationProp<ParamListBase> {
  let nav: NavigationProp<ParamListBase> | undefined = navigation;
  let last: NavigationProp<ParamListBase> = navigation;
  for (let depth = 0; depth < 8 && nav; depth += 1) {
    last = nav;
    const names = nav.getState?.()?.routeNames;
    if (names?.includes("MainTabs")) {
      return nav;
    }
    nav = nav.getParent?.();
  }
  return last;
}

function threadParams(args: NavigateInboxChatThreadPayload) {
  const peer = args.peer ?? undefined;
  return {
    conversationId: args.conversationId,
    ...(peer !== undefined ? { peer } : {}),
    ...(args.draftMessage.trim()
      ? { draftMessage: args.draftMessage.trim() }
      : {}),
  };
}

/**
 * Open a chat thread on the root stack so swipe-back returns to the
 * screen the user came from (feed, spots, a profile, etc.) instead of
 * jumping into the Notifications tab.
 */
export function navigateToInboxChatThread(
  navigation: NavigationProp<ParamListBase>,
  args: NavigateInboxChatThreadPayload,
): void {
  const params = threadParams(args);
  const root = findRootNavigator(navigation);
  if (root.getState?.()?.routeNames?.includes("ChatThread")) {
    root.navigate("ChatThread", params);
    return;
  }
  navigation.dispatch(
    CommonActions.navigate({
      name: "ChatThread",
      params,
    }),
  );
}

/** Open the messages list on the root stack. Back returns to the prior tab. */
export function navigateToInboxMessagesList(
  navigation: NavigationProp<ParamListBase>,
): void {
  const root = findRootNavigator(navigation);
  if (root.getState?.()?.routeNames?.includes("Messages")) {
    root.navigate("Messages");
    return;
  }
  navigation.dispatch(
    CommonActions.navigate({
      name: "Messages",
    }),
  );
}
