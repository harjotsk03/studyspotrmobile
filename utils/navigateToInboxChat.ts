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
 *
 * NOTE: We always pass `initial: false` on the nested params so the Inbox
 * stack mounts with `[InboxHome, Messages, ChatThread]` (rather than
 * making ChatThread itself the initial route of the inbox stack). Without
 * this, deep-linking from another tab into ChatThread leaves the inbox
 * stack with just `[ChatThread]`, which means:
 *   - `navigation.goBack()` from ChatThread has nothing to pop, so the
 *     back button silently does nothing.
 *   - Switching to the Feed tab and back to Inbox returns the user to
 *     ChatThread because that's the only screen in the inbox stack.
 *
 * With `initial: false` the Inbox tab's initial route (InboxHome) is
 * pushed first, so going back returns the user to a sensible inbox
 * surface.
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

  // `initial: false` forces React Navigation to push the inbox stack's
  // initial route (InboxHome) before the ChatThread instead of making
  // ChatThread itself the initial route. This is the difference between
  // a back-stack of `[ChatThread]` (broken back button) and `[InboxHome,
  // ChatThread]` (back button works, Inbox tab returns to home).
  const nested = {
    screen: "ChatThread" as const,
    params: threadParams,
    initial: false,
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

/** Opens the messages list tab (empty state fallback). Same `initial:
 * false` reasoning as `navigateToInboxChatThread` above — without it the
 * inbox stack would mount with Messages as the initial route and no
 * way back to InboxHome. */
export function navigateToInboxMessagesList(
  navigation: NavigationProp<ParamListBase>,
): void {
  const nested = {
    screen: "Messages" as const,
    initial: false,
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
