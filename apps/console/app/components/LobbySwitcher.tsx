import { useState, useRef, useEffect } from "react";
import { Link, useFetcher } from "react-router";
import { cn } from "@secretlobby/ui";

interface Lobby {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
}

interface LobbySwitcherProps {
  lobbies: Lobby[];
  currentLobbyId: string | null;
  className?: string;
}

export function LobbySwitcher({ lobbies, currentLobbyId, className }: LobbySwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fetcher = useFetcher();

  const currentLobby = lobbies.find((l) => l.id === currentLobbyId) || lobbies.find((l) => l.isDefault) || lobbies[0];

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  if (lobbies.length <= 1 && lobbies.length > 0) {
    // Only one lobby, show simple label
    return (
      <div className={cn("flex items-center gap-2 text-sm", className)}>
        <span className="text-theme-secondary">Lobby:</span>
        <span className="font-medium">{currentLobby?.name}</span>
      </div>
    );
  }

  if (lobbies.length === 0) {
    return null;
  }

  const handleSwitchLobby = (lobbyId: string) => {
    fetcher.submit(
      { intent: "switch-lobby", lobbyId },
      { method: "post", action: "/api/switch-lobby" }
    );
    setIsOpen(false);
  };

  return (
    <div className={cn("relative", className)} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-theme-tertiary hover:bg-[var(--color-secondary-hover)] rounded-lg border border-theme transition cursor-pointer"
      >
        <span className="text-theme-secondary">Lobby:</span>
        <span className="font-medium max-w-[150px] truncate">{currentLobby?.name}</span>
        <svg
          className={cn("w-4 h-4 text-theme-muted transition-transform", isOpen && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-theme-secondary rounded-lg border border-theme shadow-lg z-50 overflow-hidden">
          <div className="py-1 max-h-64 overflow-y-auto">
            {lobbies.map((lobby) => (
              <button
                key={lobby.id}
                type="button"
                onClick={() => handleSwitchLobby(lobby.id)}
                className={cn(
                  "w-full px-4 py-2 text-left text-sm hover:bg-theme-tertiary transition flex items-center justify-between cursor-pointer",
                  lobby.id === currentLobby?.id && "bg-theme-tertiary"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{lobby.name}</span>
                  {lobby.isDefault && (
                    <span className="flex-shrink-0 text-xs text-[var(--color-accent)]">(default)</span>
                  )}
                </div>
                {lobby.id === currentLobby?.id && (
                  <svg className="w-4 h-4 text-[var(--color-accent)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          <div className="border-t border-theme p-2">
            <Link
              to="/lobbies"
              onClick={() => setIsOpen(false)}
              className="block w-full px-3 py-2 text-sm text-center text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary rounded-lg transition cursor-pointer"
            >
              Manage Lobbies
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
