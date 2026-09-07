from dataclasses import replace
import pytest
from src.engine import LocalProvider, priority
from src.connectors.mock_connector import MockConnector
from src.automation import decide

@pytest.mark.parametrize('ticket_id,subcategory', [
 ('INC-1041','Account lockout'),('INC-1042','VPN'),('INC-1043','DNS'),('INC-1044','Printing'),
 ('INC-1045','Windows 11'),('INC-1046','Microsoft 365'),('INC-1047','Shared folder'),('INC-1048','ERP')])
def test_demo_scenarios(ticket_id,subcategory):
    result=LocalProvider().analyze(MockConnector().get_ticket(ticket_id))
    assert result.subcategory==subcategory
    assert result.knowledge_articles
    assert result.troubleshooting_steps
    assert 0 <= result.confidence_score <= 1

@pytest.mark.parametrize('impact,urgency,expected',[
 ('High','High','P1'),('High','Medium','P2'),('High','Low','P3'),
 ('Medium','High','P2'),('Medium','Medium','P3'),('Medium','Low','P4'),
 ('Low','High','P3'),('Low','Medium','P4'),('Low','Low','P4')])
def test_priority_policy(impact,urgency,expected):
    assert priority(impact,urgency)==expected

@pytest.mark.parametrize('title,description',[
 ('Cafeteria request','Please arrange lunch for visitors'),
 ('Security incident','Unexpected MFA prompts and a suspicious account sign-in')])
def test_uncertain_and_security_cases_block_automation(title,description):
    ticket=replace(MockConnector().get_ticket('INC-1042'),title=title,description=description)
    result=LocalProvider().analyze(ticket)
    assert result.escalation_required
    assert result.suggested_automation is None
    assert 'Not established' in result.probable_root_cause

def test_approval_rejection_and_allowlist():
    assert 'SIMULATED' in decide('INC-1','spooler-review','approved').result
    assert 'no action' in decide('INC-1','spooler-review','rejected').result
    with pytest.raises(ValueError): decide('INC-1','arbitrary-shell','approved')
    with pytest.raises(ValueError): decide('INC-1','spooler-review','execute')

def test_mock_write_and_resolution_gate():
    connector=MockConnector()
    with pytest.raises(ValueError): connector.update_ticket('INC-1042','Resolved','Looks fixed')
    connector.update_ticket('INC-1042','Escalated','Gateway evidence sent to network team')
    assert connector.get_ticket('INC-1042').status=='Escalated'
    connector.update_ticket('INC-1042','Resolved','User confirmed connectivity',True)
    assert connector.get_ticket('INC-1042').status=='Resolved'
    assert len(connector.notes)==2
    assert MockConnector().get_ticket('INC-1042').status=='Open'

def test_input_validation():
    with pytest.raises(ValueError): replace(MockConnector().get_ticket('INC-1042'),impact='Critical')
    with pytest.raises(ValueError): replace(MockConnector().get_ticket('INC-1042'),description=' ')
