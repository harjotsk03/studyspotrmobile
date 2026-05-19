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

/** Walk up until we hit the tab navigator (route names include Inbox). */
function findTabNavigator(
  navigation: NavigationProp<ParamListBase>,
): NavigationProp<ParamListBase> | null {
  let nav: NavigationProp<ParamListBase> | undefined = navigation;
  for (let depth = 0; depth < 6 && nav; depth += 1) {
    const names = nav.getState?.()?.routeNames;
    if (names?.includes("Inbox")) {
      return nav;
    }
    nav = nav.getParent?.();
  }
  return null;
}

/**
 * Navigate to ChatThread inside the Messages tab from feed, profile stack modals,
 * or root-stack modals — whichever navigator is wired in App.
 */
export function navigateToInboxChatThread(
  navigation: NavigationProp<ParamListBase>,
  args: NavigateInboxChatThreadPayload,
): void {
  const peer = args.peer ?? undefined;
  const threadParams = {
    conversationId: args.conversationId,
    ...(peer !== undefined ? { peer } : {}),
    ...(args.draftMessage.trim()
      ? { draftMessage: args.draftMessage.trim() }
      : {}),
  };

  const nested = {
    screen: "ChatThread" as const,
    params: threadParams,
  };

  const tabNav = findTabNavigator(navigation);
  if (tabNav) {
    tabNav.dispatch(
      CommonActions.navigate({
        name: "Inbox",
        params: nested,
      }),
    );
    return;
  }

  navigation.dispatch(
    CommonActions.navigate({
      name: "MainTabs",
      params: {
        screen: "Inbox",
        params: nested,
      },
    }),
  );
}

/** Opens the messages list tab (empty state fallback). */
export function navigateToInboxMessagesList(
  navigation: NavigationProp<ParamListBase>,
): void {
  const tabNav = findTabNavigator(navigation);
  if (tabNav) {
    tabNav.dispatch(
      CommonActions.navigate({
        name: "Inbox",
        params: { screen: "Messages" },
      }),
    );
    return;
  }
  navigation.dispatch(
    CommonActions.navigate({
      name: "MainTabs",
      params: {
        screen: "Inbox",
        params: { screen: "Messages" },
      },
    }),
  );
}
