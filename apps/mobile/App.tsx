import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import { BriefDetailScreen } from "./src/screens/brief-detail-screen";
import { ArchiveScreen } from "./src/screens/archive-screen";
import { LatestScreen } from "./src/screens/latest-screen";
import { SettingsScreen } from "./src/screens/settings-screen";
import { supabase } from "./src/lib/supabase";
import type { MainTabParamList, RootStackParamList } from "./src/navigation/types";

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs({
  session,
  isSessionLoading,
}: {
  session: Session | null;
  isSessionLoading: boolean;
}) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#f8fafc" },
        headerTitleStyle: { color: "#0f172a" },
        tabBarStyle: { backgroundColor: "#ffffff" },
        tabBarActiveTintColor: "#1d4ed8",
      }}
    >
      <Tab.Screen name="Latest" component={LatestScreen} options={{ title: "Latest" }} />
      <Tab.Screen name="Archive" component={ArchiveScreen} options={{ title: "Archive" }} />
      <Tab.Screen name="Settings" options={{ title: "Settings" }}>
        {() => <SettingsScreen session={session} isSessionLoading={isSessionLoading} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadInitialSession() {
      const { data } = await supabase.auth.getSession();
      if (!active) {
        return;
      }

      setSession(data.session ?? null);
      setIsSessionLoading(false);
    }

    void loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsSessionLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isSessionLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" }}>
        <StatusBar style="dark" />
        <ActivityIndicator size="small" color="#1d4ed8" />
        <Text style={{ marginTop: 8, color: "#475569" }}>Loading session...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator>
        <Stack.Screen
          name="MainTabs"
          options={{ headerShown: false }}
        >
          {() => <MainTabs session={session} isSessionLoading={isSessionLoading} />}
        </Stack.Screen>
        <Stack.Screen
          name="BriefDetail"
          component={BriefDetailScreen}
          options={({ route }) => ({
            title: route.params.briefDate,
            headerStyle: { backgroundColor: "#f8fafc" },
            headerTitleStyle: { color: "#0f172a" },
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
