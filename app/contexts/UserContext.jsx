"use client";
import { createContext, useContext, useEffect, useState } from "react";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSessionAndUser = async () => {
      try {
        const response = await fetch("/api/auth", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          setUser(null);
          return;
        }

        const data = await response.json();
        setUser(data?.user ?? null);
      } catch (error) {
        console.error("Failed to resolve session:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    getSessionAndUser();
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser, loading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
