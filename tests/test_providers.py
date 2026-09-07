import json
from unittest.mock import patch
import pytest
from src.providers import OllamaProvider, ProviderError
from src.connectors.mock_connector import MockConnector
from src.engine import LocalProvider

class Reply:
    def __init__(self,value): self.value=value
    def __enter__(self): return self
    def __exit__(self,*args): pass
    def read(self,n): return json.dumps({'response':json.dumps(self.value)}).encode()

def test_llm_cannot_change_policy_or_action(monkeypatch):
    monkeypatch.setenv('OLLAMA_URL','http://localhost:11434')
    ticket=MockConnector().get_ticket('INC-1044')
    data={'probable_root_cause':'Queue issue needs validation','troubleshooting_steps':['Inspect queue status'],
          'suggested_response':'We will investigate the printer queue.', 'priority':'P4','suggested_automation':'run-shell','escalation_required':False}
    with patch('src.providers.urlopen',return_value=Reply(data)):
        actual=OllamaProvider().analyze(ticket)
    expected=LocalProvider().analyze(ticket)
    assert actual.priority==expected.priority=='P2'
    assert actual.suggested_automation==expected.suggested_automation
    assert actual.escalation_required
    assert actual.provider.startswith('Local ML + Ollama')

def test_invalid_llm_response_fails_without_raw_output(monkeypatch):
    monkeypatch.setenv('OLLAMA_URL','http://localhost:11434')
    with patch('src.providers.urlopen',return_value=Reply({'secret':'sensitive-body'})):
        with pytest.raises(ProviderError) as error:
            OllamaProvider().analyze(MockConnector().get_ticket('INC-1042'))
    assert 'sensitive-body' not in str(error.value)

@pytest.mark.parametrize('url',['https://external.example','http://localhost:11434@evil.example','http://localhost:11434/path'])
def test_llm_rejects_nonlocal_endpoint(monkeypatch,url):
    monkeypatch.setenv('OLLAMA_URL',url)
    with pytest.raises(ProviderError): OllamaProvider().analyze(MockConnector().get_ticket('INC-1042'))
