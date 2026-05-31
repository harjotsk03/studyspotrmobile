import { Image, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  HeartHandshake,
  Inbox,
  MapPinnedIcon,
  Newspaper,
  User,
} from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  Gabarito_400Regular,
  Gabarito_500Medium,
  Gabarito_600SemiBold,
  Gabarito_700Bold,
  Gabarito_800ExtraBold,
  Gabarito_900Black,
} from "@expo-google-fonts/gabarito";
import {
  InstrumentSans_400Regular,
  InstrumentSans_400Regular_Italic,
  InstrumentSans_500Medium,
  InstrumentSans_500Medium_Italic,
  InstrumentSans_600SemiBold,
  InstrumentSans_600SemiBold_Italic,
  InstrumentSans_700Bold,
  InstrumentSans_700Bold_Italic,
} from "@expo-google-fonts/instrument-sans";
import { Colors } from "./constants/Colors";
import { AuthProvider, useAuth } from "./context/AuthContext";
import {
  NotificationsProvider,
  useNotifications,
} from "./context/NotificationsContext";
import { FeedInteractionsProvider } from "./context/FeedInteractionsContext";
import { SearchStateProvider } from "./context/SearchStateContext";
import { SpotsProvider } from "./context/SpotsContext";
import {
  FeedActivityProvider,
  useFeedActivity,
} from "./context/FeedActivityContext";
import { CommunityCacheProvider } from "./context/CommunityCacheContext";
import {
  FullScreenOverlayProvider,
  useFullScreenOverlay,
} from "./context/FullScreenOverlayContext";
import SpinningArrowLoader from "./components/SpinningArrowLoader";

import FeedScreen from "./screens/FeedScreen";
import CommunityScreen from "./screens/CommunityScreen";
import CommunityDetailScreen, {
  type CommunityStackParamList,
} from "./screens/CommunityDetailScreen";
import CommunityInfoScreen from "./screens/CommunityInfoScreen";
import CreateCommunityScreen from "./screens/CreateCommunityScreen";
import EditCommunityScreen from "./screens/EditCommunityScreen";
import CommunityEventsScreen from "./screens/CommunityEventsScreen";
import CreateEventScreen from "./screens/CreateEventScreen";
import InviteEventScreen from "./screens/InviteEventScreen";
import CommunityMembersScreen from "./screens/CommunityMembersScreen";
import ProfileSectionScreen, {
  type ProfileStackParamList,
} from "./screens/ProfileSectionScreen";
import FeedPostDetailScreen from "./screens/FeedPostDetailScreen";
import FeedInteractionsScreen from "./screens/FeedInteractionsScreen";
import UserPostsFeedScreen from "./screens/UserPostsFeedScreen";
import InboxScreen from "./screens/InboxScreen";
import FriendRequestsScreen from "./screens/FriendRequestsScreen";
import MessagesScreen from "./screens/MessagesScreen";
import ChatThreadScreen from "./screens/ChatThreadScreen";
import PublicProfileScreen from "./screens/PublicProfileScreen";
import SpotsScreen from "./screens/SpotsScreen";
import SpotDetailScreen from "./screens/SpotDetailScreen";
import SpotWizardScreen from "./screens/SpotWizardScreen";
import ProfileScreen from "./screens/ProfileScreen";
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import ForgotPasswordScreen from "./screens/ForgotPasswordScreen";
import { Fonts } from "./constants/Fonts";
import type {
  InboxStackParamList,
  RootStackParamList,
  SpotsStackParamList,
} from "./types/navigation";
import { SkeletonBox } from "./components/Skeleton";
import LoginWelcomeToast from "./components/LoginWelcomeToast";

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const CommunityStack = createNativeStackNavigator<CommunityStackParamList>();
const SpotsStack = createNativeStackNavigator<SpotsStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const InboxStack = createNativeStackNavigator<InboxStackParamList>();
const AuthStack = createNativeStackNavigator();

function CommunityStackScreen() {
  return (
    <CommunityStack.Navigator
      screenOptions={{ headerShown: false, animation: "slide_from_right" }}
    >
      <CommunityStack.Screen name="CommunityList" component={CommunityScreen} />
      <CommunityStack.Screen
        name="CommunityDetail"
        component={CommunityDetailScreen}
      />
      <CommunityStack.Screen
        name="CommunityInfo"
        component={CommunityInfoScreen}
      />
      <CommunityStack.Screen
        name="CreateCommunity"
        component={CreateCommunityScreen}
      />
      <CommunityStack.Screen
        name="EditCommunity"
        component={EditCommunityScreen}
      />
      <CommunityStack.Screen
        name="CommunityEvents"
        component={CommunityEventsScreen}
      />
      <CommunityStack.Screen name="CreateEvent" component={CreateEventScreen} />
      <CommunityStack.Screen name="InviteEvent" component={InviteEventScreen} />
      <CommunityStack.Screen
        name="CommunityMembers"
        component={CommunityMembersScreen}
      />
    </CommunityStack.Navigator>
  );
}

function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
      }}
    >
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} />
      <ProfileStack.Screen
        name="ProfileSection"
        component={ProfileSectionScreen}
      />
      <ProfileStack.Screen
        name="FeedPostDetail"
        component={FeedPostDetailScreen}
      />
      <ProfileStack.Screen
        name="UserPostsFeed"
        component={UserPostsFeedScreen}
      />
    </ProfileStack.Navigator>
  );
}

function SpotsStackScreen() {
  return (
    <SpotsStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
      }}
    >
      <SpotsStack.Screen name="SpotsHome" component={SpotsScreen} />
      <SpotsStack.Screen name="SpotDetail" component={SpotDetailScreen} />
      <SpotsStack.Screen name="CreateSpot" component={SpotWizardScreen} />
      <SpotsStack.Screen name="EditSpot" component={SpotWizardScreen} />
    </SpotsStack.Navigator>
  );
}

function InboxStackScreen() {
  return (
    <InboxStack.Navigator
      screenOptions={{ headerShown: false, animation: "slide_from_right" }}
    >
      <InboxStack.Screen name="InboxHome" component={InboxScreen} />
      <InboxStack.Screen
        name="FriendRequests"
        component={FriendRequestsScreen}
      />
      <InboxStack.Screen name="Messages" component={MessagesScreen} />
      <InboxStack.Screen name="ChatThread" component={ChatThreadScreen} />
    </InboxStack.Navigator>
  );
}

const tabIcons: Record<
  string,
  React.ComponentType<{ size: number; color: string; strokeWidth?: number }>
> = {
  Feed: Newspaper,
  Community: HeartHandshake,
  Inbox: Inbox,
  Spots: MapPinnedIcon,
  Profile: User,
};

/**
 * Sizing for the avatar-as-tab-icon. We hide the "Profile" label when a
 * photo is present (see Profile Tab.Screen options below) and inflate the
 * avatar to fill the space the label vacates — that way the bottom nav
 * feels balanced rather than top-heavy with a tiny icon over an empty
 * label slot.
 */
const PROFILE_AVATAR_SIZE = 28;
const tabAvatarStyles = StyleSheet.create({
  avatar: {
    width: PROFILE_AVATAR_SIZE,
    height: PROFILE_AVATAR_SIZE,
    borderRadius: PROFILE_AVATAR_SIZE / 2,
    borderWidth: 1.5,
    backgroundColor: "#eee",
  },
});

function AppContent() {
  const { profile, isLoading } = useAuth();
  const { unreadCount } = useNotifications();
  const { feedLoading } = useFeedActivity();
  const { isOverlayOpen } = useFullScreenOverlay();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: Colors.light,
        }}
      >
        <SkeletonBox width={96} height={96} radius={48} />
        <SkeletonBox
          width={150}
          height={18}
          radius={9}
          style={{ marginTop: 22 }}
        />
        <SkeletonBox
          width={100}
          height={14}
          radius={7}
          style={{ marginTop: 10 }}
        />
      </View>
    );
  }

  if (!profile) {
    return (
      <AuthStack.Navigator
        screenOptions={{ headerShown: false, animation: "slide_from_right" }}
      >
        <AuthStack.Screen name="LoginScreen" component={LoginScreen} />
        <AuthStack.Screen name="RegisterScreen" component={RegisterScreen} />
        <AuthStack.Screen
          name="ForgotPasswordScreen"
          component={ForgotPasswordScreen}
        />
      </AuthStack.Navigator>
    );
  }

  // When the signed-in user has a profile photo we swap the generic
  // `User` icon on the Profile tab for their avatar. Keeps the bottom
  // nav personal at a glance, and falls back to the icon when no photo
  // is set so the tab always renders something.
  const profilePhotoRaw = profile?.userProfile?.profile_photo;
  const profilePhotoUri =
    typeof profilePhotoRaw === "string" && profilePhotoRaw.trim().length > 0
      ? encodeURI(profilePhotoRaw.trim())
      : "";

  const tabs = (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => {
          // Swap the Feed icon for the spinning arrow loader while the feed
          // is actively fetching, so the tab itself signals that a refresh
          // (e.g. user tapped the tab again) is in flight.
          if (route.name === "Feed" && feedLoading) {
            return (
              <SpinningArrowLoader
                size={24}
                color={focused ? Colors.accent : "#999"}
                strokeWidth={2.2}
              />
            );
          }
          if (route.name === "Profile" && profilePhotoUri) {
            // Match the 24px icon footprint exactly so spacing in the tab
            // bar doesn't shift when the avatar replaces the icon. A 1.5px
            // ring (accent when focused, neutral when not) gives the same
            // focused/unfocused affordance the other tabs get via colour.
            return (
              <Image
                source={{ uri: profilePhotoUri }}
                style={[
                  tabAvatarStyles.avatar,
                  {
                    borderColor: focused ? Colors.accent : "transparent",
                  },
                ]}
              />
            );
          }
          const Icon = tabIcons[route.name];
          return (
            <Icon
              size={24}
              color={focused ? Colors.accent : "#999"}
              strokeWidth={2.2}
            />
          );
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: "#999",
        tabBarLabelStyle: {
          fontFamily: Fonts.gabarito.medium,
          fontSize: 12,
        },
        // Hide the tab bar while a full-screen overlay (e.g. the reel viewer)
        // is up. The overlay is rendered in-tree (not a native Modal) so the
        // only way to make it cover the bottom area is to dynamically retract
        // the tab bar — and we restore it the instant the overlay closes.
        tabBarStyle: isOverlayOpen
          ? { display: "none" }
          : {
              backgroundColor: "#fff",
              height: 80,
              borderTopWidth: 1,
              paddingTop: 10,
              paddingHorizontal: 8,
              borderTopColor: "#eee",
            },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} options={{
        tabBarLabel: "",
      }} />
      <Tab.Screen name="Community" component={CommunityStackScreen} options={{
        tabBarLabel: "",
      }} />
      <Tab.Screen name="Spots" component={SpotsStackScreen} options={{
        tabBarLabel: "",
      }} />
      <Tab.Screen
        name="Inbox"
        component={InboxStackScreen}
        options={{
          tabBarLabel: "",
          tabBarBadge:
            unreadCount > 0
              ? unreadCount > 99
                ? "99+"
                : unreadCount
              : undefined,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackScreen}
        options={{
          // When the user has a profile photo, drop the "Profile" label
          // so the bigger avatar can sit on its own. Without a photo the
          // generic User icon stays alongside the label like every other
          // tab.
          tabBarLabel: "",
        }}
      />
    </Tab.Navigator>
  );

  return (
    <View style={{ flex: 1 }}>
      <RootStack.Navigator
        screenOptions={{ headerShown: false, animation: "slide_from_right" }}
      >
        <RootStack.Screen name="MainTabs" children={() => tabs} />
        <RootStack.Screen
          name="PublicProfile"
          component={PublicProfileScreen}
        />
        <RootStack.Screen
          name="SpotViewer"
          component={SpotDetailScreen}
          options={{ gestureEnabled: true }}
        />
        <RootStack.Screen
          name="FeedPostDetail"
          component={FeedPostDetailScreen}
        />
        <RootStack.Screen
          name="FeedInteractions"
          component={FeedInteractionsScreen}
        />
        <RootStack.Screen
          name="UserPostsFeed"
          component={UserPostsFeedScreen}
        />
        <RootStack.Screen
          name="CommunityDetail"
          component={CommunityDetailScreen}
        />
        <RootStack.Screen
          name="CommunityInfo"
          component={CommunityInfoScreen}
        />
        <RootStack.Screen
          name="CommunityEvents"
          component={CommunityEventsScreen}
        />
        <RootStack.Screen
          name="EditCommunity"
          component={EditCommunityScreen}
        />
        <RootStack.Screen name="CreateEvent" component={CreateEventScreen} />
        <RootStack.Screen name="InviteEvent" component={InviteEventScreen} />
        <RootStack.Screen
          name="CommunityMembers"
          component={CommunityMembersScreen}
        />
      </RootStack.Navigator>
      <LoginWelcomeToast />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Gabarito_400Regular,
    Gabarito_500Medium,
    Gabarito_600SemiBold,
    Gabarito_700Bold,
    Gabarito_800ExtraBold,
    Gabarito_900Black,
    InstrumentSans_400Regular,
    InstrumentSans_400Regular_Italic,
    InstrumentSans_500Medium,
    InstrumentSans_500Medium_Italic,
    InstrumentSans_600SemiBold,
    InstrumentSans_600SemiBold_Italic,
    InstrumentSans_700Bold,
    InstrumentSans_700Bold_Italic,
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: Colors.light,
        }}
      >
        <SkeletonBox width={96} height={96} radius={48} />
        <SkeletonBox
          width={150}
          height={18}
          radius={9}
          style={{ marginTop: 22 }}
        />
        <SkeletonBox
          width={100}
          height={14}
          radius={7}
          style={{ marginTop: 10 }}
        />
      </View>
    );
  }

  return (
    <AuthProvider>
      <NotificationsProvider>
        <FeedInteractionsProvider>
          <SearchStateProvider>
            <SpotsProvider>
              <CommunityCacheProvider>
                <FeedActivityProvider>
                  <FullScreenOverlayProvider>
                    <SafeAreaProvider>
                      <NavigationContainer>
                        <StatusBar style="dark" />
                        <AppContent />
                      </NavigationContainer>
                    </SafeAreaProvider>
                  </FullScreenOverlayProvider>
                </FeedActivityProvider>
              </CommunityCacheProvider>
            </SpotsProvider>
          </SearchStateProvider>
        </FeedInteractionsProvider>
      </NotificationsProvider>
    </AuthProvider>
  );
}
