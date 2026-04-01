import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      currentUser: null,
      login: (currentUser) => set({ currentUser }),
      logout: () => set({ currentUser: null }),
      setName: (name) => set((s) => ({ currentUser: s.currentUser ? { ...s.currentUser, name } : null })),
    }),
    { name: "vennball-auth" }
  )
);
