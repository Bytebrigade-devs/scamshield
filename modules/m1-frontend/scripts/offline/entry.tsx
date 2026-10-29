import * as React from "react";
import { createRoot } from "react-dom/client";
import { JourneyProvider } from "../../src/components/journey-provider";
import {
  Landing,
  Onboarding,
  Benefits,
  Share,
  Signup,
  Privacy,
} from "../../src/components/screens";
import { usePathname } from "./router-shim";
function App() {
  const route = usePathname();
  const View = route.startsWith("/onboarding")
    ? Onboarding
    : route.startsWith("/benefits")
      ? Benefits
      : route.startsWith("/share")
        ? Share
        : route.startsWith("/signup")
          ? Signup
          : route.startsWith("/privacy")
            ? Privacy
            : Landing;
  return (
    <JourneyProvider>
      <View />
    </JourneyProvider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
