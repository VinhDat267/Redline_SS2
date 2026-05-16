import pytest

from app.models import ChangeItem
from app.services.ai_review_drafts import calibrate_generated_risk_level


@pytest.mark.parametrize(
    ("section_title", "old_content", "new_content"),
    [
        (
            "2. Exclusions",
            "Confidential Information excludes information independently developed without use of Confidential Information.",
            "The independently developed exclusion is removed.",
        ),
        (
            "5. Termination",
            "Either party may terminate for convenience with 30 days written notice.",
            "Recipient may terminate for convenience with 10 days written notice.",
        ),
        (
            "3. Payment",
            "Fees are invoiced monthly in arrears and payable 30 days after invoice.",
            "Fifty percent of fees are due upfront and remaining invoices are payable 15 days after invoice.",
        ),
        (
            "5. Change Control",
            "Out-of-scope work requires a written change order signed by both parties before extra fees apply.",
            "Vendor may charge time-and-materials fees for out-of-scope requests before written change-order approval.",
        ),
    ],
)
def test_calibrate_generated_risk_level_downgrades_medium_eval_profiles(
    section_title,
    old_content,
    new_content,
):
    change_item = ChangeItem(
        section_title=section_title,
        old_content=old_content,
        new_content=new_content,
        change_type="modified",
        surface_type="body",
        surface_key="body",
    )

    assert calibrate_generated_risk_level(change_item, "high") == "medium"


@pytest.mark.parametrize(
    ("section_title", "old_content", "new_content"),
    [
        (
            "6. Limitation of Liability",
            "Direct damages are capped at fees paid in the prior 12 months, excluding confidentiality breach and equitable remedies.",
            "All damages are capped at one month of fees, including confidentiality breach and equitable remedies.",
        ),
        (
            "2. Acceptance",
            "Customer has 10 business days to reject non-conforming deliverables with written reasons.",
            "Deliverables are deemed accepted after 3 business days unless Customer provides detailed defect evidence.",
        ),
        (
            "4. IP Ownership",
            "Customer owns all custom deliverables upon full payment.",
            "Vendor retains ownership of all deliverables and grants Customer a non-exclusive internal-use license.",
        ),
    ],
)
def test_calibrate_generated_risk_level_preserves_high_eval_profiles(
    section_title,
    old_content,
    new_content,
):
    change_item = ChangeItem(
        section_title=section_title,
        old_content=old_content,
        new_content=new_content,
        change_type="modified",
        surface_type="body",
        surface_key="body",
    )

    assert calibrate_generated_risk_level(change_item, "high") == "high"


def test_calibrate_generated_risk_level_leaves_non_high_values_unchanged():
    change_item = ChangeItem(
        section_title="3. Payment",
        old_content="Fees are payable 30 days after invoice.",
        new_content="Fees are payable 15 days after invoice.",
        change_type="modified",
        surface_type="body",
        surface_key="body",
    )

    assert calibrate_generated_risk_level(change_item, "medium") == "medium"
    assert calibrate_generated_risk_level(change_item, None) is None
