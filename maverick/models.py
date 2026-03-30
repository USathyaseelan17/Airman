from pydantic import BaseModel, Field
from typing import List


# Defines exactly what Skynet must send to Maverick.
# FastAPI automatically validates every incoming request against this model.
# If any field is missing or the wrong type, FastAPI rejects it with a
# clear error message before our logic ever runs.

class EvaluationInput(BaseModel):
    student_name: str
    course_name: str
    overall_rating: int = Field(..., ge=1, le=5)
    technical_rating: int = Field(..., ge=1, le=5)
    non_technical_rating: int = Field(..., ge=1, le=5)
    remarks: str | None = None

# Defines exactly what Maverick will return to Skynet.
# FastAPI uses this to validate and serialize the response —
# if the logic returns the wrong shape, FastAPI catches it.

class InsightOutput(BaseModel):
    summary: str
    focus_areas: List[str]
    study_recommendations: List[str]