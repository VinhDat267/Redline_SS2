from run_eval_rehearsal import find_matching_clause_change, score_chat_exchange


def test_find_matching_clause_change_uses_evidence_keywords():
    case = {
        "case_id": "NDA-REV-001",
        "clause_title": "Limitation of Liability",
        "evidence_keywords": ["one month of fees", "equitable remedies"],
    }
    changes = [
        {
            "id": 10,
            "clause_title": "Confidentiality Term",
            "old_text": "Confidentiality obligations continue for three years.",
            "new_text": "Confidentiality obligations continue for five years.",
        },
        {
            "id": 20,
            "clause_title": "Limitation of Liability",
            "old_text": "Direct damages are capped at fees paid in the prior 12 months.",
            "new_text": "All damages are capped at one month of fees, including equitable remedies.",
        },
    ]

    assert find_matching_clause_change(case, changes)["id"] == 20


def test_score_chat_exchange_requires_citation_support():
    case = {
        "required_citation_keywords": ["Vendor retains ownership", "internal-use license"],
        "disallowed_claims": ["Customer owns all custom deliverables"],
    }
    assistant_message = {
        "content": "Vendor retains ownership and Customer receives an internal-use license.",
        "citations": [
            {
                "content": "Vendor retains ownership of all deliverables and grants Customer a non-exclusive internal-use license."
            }
        ],
    }

    score = score_chat_exchange(case, assistant_message)

    assert score["score_correctness"] == 1
    assert score["citation_present"] == "yes"
    assert score["citation_supports_answer"] == "yes"
    assert score["score_truth_boundary"] == 1
