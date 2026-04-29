export function createPageUrl(pageName: string) {
    const routes: Record<string, string> = {
        NutritionLog: "/nutrition/log",
        WorkoutsLog: "/workouts/log",
    };
    return routes[pageName] || '/' + pageName.replace(/ /g, '-');
}
