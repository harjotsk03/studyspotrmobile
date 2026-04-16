import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Newspaper, Handshake, Search, MapPin, CircleUserRound, HeartHandshake, MapPinnedIcon, User } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Gabarito_400Regular, Gabarito_500Medium, Gabarito_600SemiBold, Gabarito_700Bold, Gabarito_800ExtraBold, Gabarito_900Black } from '@expo-google-fonts/gabarito';
import { InstrumentSans_400Regular, InstrumentSans_400Regular_Italic, InstrumentSans_500Medium, InstrumentSans_500Medium_Italic, InstrumentSans_600SemiBold, InstrumentSans_600SemiBold_Italic, InstrumentSans_700Bold, InstrumentSans_700Bold_Italic } from '@expo-google-fonts/instrument-sans';
import { Colors } from './constants/Colors';
import { AuthProvider, useAuth } from './context/AuthContext';

import FeedScreen from './screens/FeedScreen';
import CommunityScreen from './screens/CommunityScreen';
import CommunityDetailScreen, { type CommunityStackParamList } from './screens/CommunityDetailScreen';
import ProfileSectionScreen, { type ProfileStackParamList } from './screens/ProfileSectionScreen';
import SearchScreen from './screens/SearchScreen';
import SpotsScreen from './screens/SpotsScreen';
import ProfileScreen from './screens/ProfileScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import { Fonts } from './constants/Fonts';

const Tab = createBottomTabNavigator();
const CommunityStack = createNativeStackNavigator<CommunityStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const AuthStack = createNativeStackNavigator();

function CommunityStackScreen() {
  return (
    <CommunityStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <CommunityStack.Screen name="CommunityList" component={CommunityScreen} />
      <CommunityStack.Screen name="CommunityDetail" component={CommunityDetailScreen} />
    </CommunityStack.Navigator>
  );
}

function ProfileStackScreen() {
  return (
    <ProfileStack.Navigator
      screenOptions={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }}
    >
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} />
      <ProfileStack.Screen name="ProfileSection" component={ProfileSectionScreen} />
    </ProfileStack.Navigator>
  );
}

const tabIcons: Record<string, React.ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
  Feed: Newspaper,
  Community: HeartHandshake,
  Search: Search,
  Spots: MapPinnedIcon,
  Profile: User,
};

function AppContent() {
  const { profile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.light }}>
        <ActivityIndicator size="large" color={Colors.primary} />
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

  return (
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
        tabBarInactiveTintColor: '#999',
        tabBarLabelStyle: {
          fontFamily: Fonts.gabarito.medium,
          fontSize: 12,
        },
        tabBarStyle: {
          backgroundColor: '#fff',
          height: 88,
          borderTopWidth: 1,
          paddingTop: 10,
          paddingHorizontal: 8,
          borderTopColor: '#eee',
        },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Community" component={CommunityStackScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Spots" component={SpotsScreen} />
      <Tab.Screen name="Profile" component={ProfileStackScreen} />
    </Tab.Navigator>
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
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.light }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <AppContent />
      </NavigationContainer>
    </AuthProvider>
  );
}
