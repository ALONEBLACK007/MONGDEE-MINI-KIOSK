from fastapi import APIRouter

from app import db
from app.schemas import AnalyticsHourlyRow, AnalyticsSummaryRow

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary", response_model=list[AnalyticsSummaryRow])
def summary():
    return [AnalyticsSummaryRow(**dict(r)) for r in db.analytics_summary()]


@router.get("/hourly", response_model=list[AnalyticsHourlyRow])
def hourly():
    return [AnalyticsHourlyRow(**dict(r)) for r in db.analytics_hourly()]
