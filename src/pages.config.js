import Coach from './pages/Coach';
import Nutrition from './pages/Nutrition';
import Onboarding from './pages/Onboarding';
import Profile from './pages/Profile';
import Progress from './pages/Progress';
import Workouts from './pages/Workouts';
import __Layout from './Layout.jsx';

export const PAGES = {
    "Coach": Coach,
    "Nutrition": Nutrition,
    "Onboarding": Onboarding,
    "Profile": Profile,
    "Progress": Progress,
    "Workouts": Workouts,
}

export const pagesConfig = {
    mainPage: "Onboarding",
    Pages: PAGES,
    Layout: __Layout,
};
