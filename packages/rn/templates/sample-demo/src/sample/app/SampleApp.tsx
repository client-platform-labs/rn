import {
  NavigationContainer,
  useNavigationContainerRef,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { Linking, StatusBar, StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type {
  CapabilitiesStackParamList,
  RootTabParamList,
  TicketsStackParamList,
} from "./navigation";
import { AboutScreen } from "../features/about/AboutScreen";
import { CapabilitiesHomeScreen } from "../features/capabilities/CapabilitiesHomeScreen";
import { WebViewDemoScreen } from "../features/capabilities/WebViewDemoScreen";
import { TicketDetailScreen } from "../features/tickets/TicketDetailScreen";
import { TicketFormScreen } from "../features/tickets/TicketFormScreen";
import { TicketListScreen } from "../features/tickets/TicketListScreen";
import { parseTicketDeepLink } from "../linking/sampleScheme";
import { colors, typography } from "../ui";

const TicketsStack = createNativeStackNavigator<TicketsStackParamList>();
const CapabilitiesStack = createNativeStackNavigator<CapabilitiesStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.paper },
  headerShadowVisible: false,
  headerTintColor: colors.ink,
  headerTitleStyle: { ...typography.headline },
  contentStyle: { backgroundColor: colors.paper },
};

const linking = {
  prefixes: ["cpl-sample://"],
  config: {
    screens: {
      TicketsTab: {
        screens: {
          TicketDetail: "ticket/:id",
        },
      },
    },
  },
};

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>{label}</Text>
  );
}

function TicketsNavigator() {
  return (
    <TicketsStack.Navigator screenOptions={stackScreenOptions}>
      <TicketsStack.Screen
        name="TicketList"
        component={TicketListScreen}
        options={{ headerShown: false }}
      />
      <TicketsStack.Screen
        name="TicketDetail"
        component={TicketDetailScreen}
        options={{ title: "工单详情" }}
      />
      <TicketsStack.Screen
        name="TicketForm"
        component={TicketFormScreen}
        options={{ title: "工单表单" }}
      />
    </TicketsStack.Navigator>
  );
}

function CapabilitiesNavigator() {
  return (
    <CapabilitiesStack.Navigator screenOptions={stackScreenOptions}>
      <CapabilitiesStack.Screen
        name="CapabilitiesHome"
        component={CapabilitiesHomeScreen}
        options={{ headerShown: false }}
      />
      <CapabilitiesStack.Screen
        name="WebViewDemo"
        component={WebViewDemoScreen}
        options={{ title: "内嵌 H5" }}
      />
    </CapabilitiesStack.Navigator>
  );
}

export default function SampleApp() {
  const navigationRef = useNavigationContainerRef<RootTabParamList>();
  const [ready, setReady] = useState(false);

  const openTicketFromUrl = useCallback(
    (url: string | null) => {
      const id = parseTicketDeepLink(url);
      if (!id || !navigationRef.isReady()) {
        return;
      }
      navigationRef.navigate("TicketsTab", {
        screen: "TicketDetail",
        params: { id },
      });
    },
    [navigationRef],
  );

  useEffect(() => {
    if (!ready) {
      return;
    }
    Linking.getInitialURL().then(openTicketFromUrl);
    const sub = Linking.addEventListener("url", (e) => openTicketFromUrl(e.url));
    return () => sub.remove();
  }, [openTicketFromUrl, ready]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        onReady={() => setReady(true)}
      >
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.inkSubtle,
          }}
        >
          <Tab.Screen
            name="TicketsTab"
            component={TicketsNavigator}
            options={{
              tabBarLabel: ({ focused }) => <TabLabel label="工单" focused={focused} />,
            }}
          />
          <Tab.Screen
            name="CapabilitiesTab"
            component={CapabilitiesNavigator}
            options={{
              tabBarLabel: ({ focused }) => <TabLabel label="能力" focused={focused} />,
            }}
          />
          <Tab.Screen
            name="AboutTab"
            component={AboutScreen}
            options={{
              tabBarLabel: ({ focused }) => <TabLabel label="关于" focused={focused} />,
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.tabBar,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 4,
    height: 56,
  },
  tabLabel: { ...typography.caption, color: colors.inkSubtle },
  tabLabelFocused: { color: colors.accent, fontWeight: "600" },
});
