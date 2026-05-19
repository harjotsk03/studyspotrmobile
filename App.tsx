import { View } from "react-native";
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
import { SearchStateProvider } from "./context/SearchStateContext";
import { SpotsProvider } from "./context/SpotsContext";

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

function AppContent() {
  const { profile, isLoading } = useAuth();
  const { unreadCount } = useNotifications();

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

  const tabs = (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, size }) => {
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
        tabBarStyle: {
          backgroundColor: "#fff",
          height: 88,
          borderTopWidth: 1,
          paddingTop: 10,
          paddingHorizontal: 8,
          borderTopColor: "#eee",
        },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Community" component={CommunityStackScreen} />
      <Tab.Screen name="Spots" component={SpotsStackScreen} />
      <Tab.Screen
        name="Inbox"
        component={InboxStackScreen}
        options={{
          tabBarBadge:
            unreadCount > 0
              ? unreadCount > 99
                ? "99+"
                : unreadCount
              : undefined,
        }}
      />
      <Tab.Screen name="Profile" component={ProfileStackScreen} />
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
        <SearchStateProvider>
          <SpotsProvider>
            <SafeAreaProvider>
              <NavigationContainer>
                <StatusBar style="dark" />
                <AppContent />
              </NavigationContainer>
            </SafeAreaProvider>
          </SpotsProvider>
        </SearchStateProvider>
      </NotificationsProvider>
    </AuthProvider>
  );
}
