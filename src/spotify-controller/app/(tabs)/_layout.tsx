import React from "react";
import { SymbolView } from "expo-symbols";
import { Tabs } from "expo-router";

import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarInactiveTintColor: "#8f8f8f",
        tabBarStyle: {
          backgroundColor: "#0f0f0f",
          borderTopColor: "#0f0f0f",
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: "house.fill",
                android: "home",
                web: "home",
              }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: "magnifyingglass",
                android: "search",
                web: "search",
              }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: "books.vertical.fill",
                android: "library_music",
                web: "library_music",
              }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}
