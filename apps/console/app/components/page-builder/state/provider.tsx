import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
} from "react";
import {
  pageBuilderReducer,
  type PageBuilderAction,
  type PageBuilderState,
} from "./reducer";

interface PageBuilderContextValue {
  state: PageBuilderState;
  dispatch: Dispatch<PageBuilderAction>;
}

const PageBuilderContext = createContext<PageBuilderContextValue | null>(null);

export function usePageBuilder(): PageBuilderContextValue {
  const ctx = useContext(PageBuilderContext);
  if (!ctx) {
    throw new Error(
      "usePageBuilder must be used within a PageBuilderProvider"
    );
  }
  return ctx;
}

interface PageBuilderProviderProps {
  initialState: PageBuilderState;
  children: React.ReactNode;
}

export function PageBuilderProvider({
  initialState,
  children,
}: PageBuilderProviderProps) {
  const [state, dispatch] = useReducer(pageBuilderReducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return (
    <PageBuilderContext.Provider value={value}>
      {children}
    </PageBuilderContext.Provider>
  );
}

export { PageBuilderContext };
