from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from models import EvaluationInput, InsightOutput
from logic import generate_insight


app = FastAPI(
    title="Maverick Insight API",
    description="Generates structured learning insights from pilot training evaluations",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "maverick"}


# ─── Main Endpoint ────────────────────────────────────────────────────────────
# POST /insights/generate

@app.post("/insights/generate", response_model=InsightOutput)
def generate(data: EvaluationInput) -> InsightOutput:
    return generate_insight(data)


# ─── Run ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)