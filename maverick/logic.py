from models import EvaluationInput, InsightOutput


# ─── Performance Tiers ────────────────────────────────────────────────────────
# Every rating (1-5) is classified into one of three tiers.
# This is the foundation everything else builds on.

def classify_rating(rating: int) -> str:
    if rating <= 2:
        return "needs_improvement"
    elif rating == 3:
        return "average"
    else:  # 4 or 5
        return "strong"


# ─── Focus Area Rules ─────────────────────────────────────────────────────────
# Maps each weak area to a list of specific focus areas.
# These are the things the student needs to work on.

FOCUS_AREA_RULES = {
    "technical": [
        "Checklist discipline",
        "Technical accuracy",
        "Procedural consistency",
        "Aircraft systems knowledge",
    ],
    "non_technical": [
        "Communication clarity",
        "Situational awareness",
        "Crew resource management",
        "Decision making under pressure",
    ],
    "overall": [
        "Flight fundamentals",
        "Standard operating procedures",
        "Pre-flight preparation",
    ],
}


# ─── Study Recommendation Rules ───────────────────────────────────────────────
# Maps each weak area to a list of concrete study actions.
# These are the things the student should do to improve.

RECOMMENDATION_RULES = {
    "technical": [
        "Review standard operating flows",
        "Practice technical oral questions",
        "Revise aircraft systems basics",
        "Complete additional simulator sessions focused on procedures",
    ],
    "non_technical": [
        "Practice crew resource management scenarios",
        "Review communication protocols and phraseology",
        "Study threat and error management principles",
        "Participate in group debriefs to build situational awareness",
    ],
    "overall": [
        "Schedule additional ground briefings with instructor",
        "Review flight fundamentals study material",
        "Increase frequency of simulator sessions",
    ],
}


# ─── Summary Templates ────────────────────────────────────────────────────────
# Builds a human-readable summary sentence based on what is
# strong and what is weak.

def build_summary(
    technical_tier: str,
    non_technical_tier: str,
    overall_tier: str,
    student_name: str,
    course_name: str,
) -> str:
    # Both areas are strong
    if technical_tier == "strong" and non_technical_tier == "strong":
        return (
            f"{student_name} is performing well across both technical and non-technical "
            f"areas in {course_name}. Keep up the momentum and focus on consistency."
        )

    # Technical is weak, non-technical is strong
    if technical_tier == "needs_improvement" and non_technical_tier != "needs_improvement":
        return (
            f"{student_name} shows promising non-technical skills in {course_name} "
            f"but requires focused improvement in technical areas."
        )

    # Non-technical is weak, technical is strong
    if non_technical_tier == "needs_improvement" and technical_tier != "needs_improvement":
        return (
            f"{student_name} demonstrates solid technical ability in {course_name} "
            f"but needs to strengthen non-technical and crew resource management skills."
        )

    # Both are weak
    if technical_tier == "needs_improvement" and non_technical_tier == "needs_improvement":
        return (
            f"{student_name} requires focused attention across both technical and "
            f"non-technical areas in {course_name}. Recommend increased instructor support."
        )

    # Average performance across the board
    if overall_tier == "average":
        return (
            f"{student_name} is showing average performance in {course_name}. "
            f"Targeted practice in the identified focus areas will help move to the next level."
        )

    # Fallback — catches any remaining combination
    return (
        f"{student_name} has areas of strength and areas requiring improvement in "
        f"{course_name}. Review the focus areas below for a structured improvement plan."
    )


# ─── Main Logic Function ──────────────────────────────────────────────────────
# This is the only function called from main.py.
# It takes the validated input and returns a structured InsightOutput.

def generate_insight(data: EvaluationInput) -> InsightOutput:
    # Step 1: Classify each rating into a performance tier
    technical_tier     = classify_rating(data.technical_rating)
    non_technical_tier = classify_rating(data.non_technical_rating)
    overall_tier       = classify_rating(data.overall_rating)

    # Step 2: Determine which areas are weak
    # We collect weak areas so we know which rules to apply
    weak_areas = []

    if technical_tier == "needs_improvement":
        weak_areas.append("technical")

    if non_technical_tier == "needs_improvement":
        weak_areas.append("non_technical")

    # Overall rating is weak but neither specific area flagged
    # This catches edge cases like overall=2 but technical=3, non_technical=3
    if overall_tier == "needs_improvement" and "technical" not in weak_areas and "non_technical" not in weak_areas:
        weak_areas.append("overall")

    # Step 3: If no weak areas found, still give improvement suggestions
    # based on whichever area has the lower rating
    if not weak_areas:
        if data.technical_rating <= data.non_technical_rating:
            weak_areas.append("technical")
        else:
            weak_areas.append("non_technical")

    # Step 4: Build focus areas list from all weak areas
    # We use a dict to deduplicate while preserving order
    focus_areas_seen = {}
    for area in weak_areas:
        for item in FOCUS_AREA_RULES[area]:
            focus_areas_seen[item] = True

    focus_areas = list(focus_areas_seen.keys())

    # Step 5: Build study recommendations from all weak areas
    recommendations_seen = {}
    for area in weak_areas:
        for item in RECOMMENDATION_RULES[area]:
            recommendations_seen[item] = True

    study_recommendations = list(recommendations_seen.keys())

    # Step 6: Build the summary sentence
    summary = build_summary(
        technical_tier,
        non_technical_tier,
        overall_tier,
        data.student_name,
        data.course_name,
    )

    return InsightOutput(
        summary=summary,
        focus_areas=focus_areas,
        study_recommendations=study_recommendations,
    )