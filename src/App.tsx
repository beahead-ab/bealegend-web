import { SignInView } from "./SignInView";
import { TodayView } from "./TodayView";
import { isoDate, type DailyOverview } from "./daily";
import { useSession } from "./session";

function previewDay(): DailyOverview {
  return {
    date: isoDate(new Date()),
    headline: "Du har dagens riktning klar och ett pass som väntar.",
    user: { first_name: "Casper" },
    calories: {
      can_calculate: true,
      goal: 2_000,
      goal_min: 1_800,
      goal_max: 2_200,
      consumed: 1_398,
      consumed_min: 1_320,
      consumed_max: 1_490,
      remaining: 602,
      is_over: false,
    },
    health: { steps: 4_331, step_goal: 7_000, active_calories: 286 },
    macros: {
      protein: 128,
      carbs: 81,
      fat: 20,
      protein_goal: 165,
      carbs_goal: 103,
      fat_goal: 62,
    },
    meals: [
      { id: "preview-1", description: "Frukost", calories: 420, calories_min: 380, calories_max: 460, logged_at: `${isoDate(new Date())}T06:30:00+02:00` },
      { id: "preview-2", description: "Potatis, kyckling, rödlök och sås", calories: 550, calories_min: 510, calories_max: 590, logged_at: `${isoDate(new Date())}T12:10:00+02:00` },
      { id: "preview-3", description: "Grekisk yoghurt med granola", calories: 428, calories_min: 405, calories_max: 440, logged_at: `${isoDate(new Date())}T16:45:00+02:00` },
    ],
    training: {
      week_start: isoDate(new Date()),
      sessions_planned: 4,
      sessions_completed: 2,
      week_load_kg: 12_480,
      today_session_title: "Underkropp B",
      today_session_status: "planned",
    },
    hydration: { consumed_ml: 1_750, goal_ml: 2_500 },
  };
}

export function App() {
  // One call, not two. Two would be two independent state machines, and the
  // one holding signIn would not be the one being rendered — signing in would
  // succeed against a state nobody is looking at.
  const { session, signIn, signOut } = useSession();

  // A deterministic product surface for visual regression work. Vite removes
  // this branch from production builds; no preview data can reach a user.
  if (import.meta.env.DEV && window.location.pathname === "/__preview") {
    return <TodayView onSignOut={() => undefined} preview={previewDay()} />;
  }

  if (session.status === "restoring") {
    return (
      <div className="app-shell">
        <div className="centered">
          <p className="muted">Hämtar din session…</p>
        </div>
      </div>
    );
  }

  if (session.status === "signedOut" || session.status === "signingIn") {
    return (
      <div className="app-shell">
        <SignInView onSignIn={signIn} busy={session.status === "signingIn"} />
      </div>
    );
  }

  // The account, passed down so the offline cache can be tied to it. Without
  // an id nothing is remembered at all — see lastKnown.ts.
  return <TodayView onSignOut={signOut} user={session.user} />;
}
