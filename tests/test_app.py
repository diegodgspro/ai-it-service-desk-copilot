from streamlit.testing.v1 import AppTest
from pathlib import Path

def button(app,label):
    return next(b for b in app.button if b.label==label)

def test_ui_workflow_and_stale_approval():
    app=AppTest.from_file(Path(__file__).resolve().parents[1] / 'app.py',default_timeout=30).run()
    assert not app.exception
    button(app,'Analyze Ticket').click().run()
    assert not app.exception
    assert any(m.value=='Network' for m in app.metric)
    button(app,'Approve simulation').click().run()
    assert not app.exception
    assert any('SIMULATED' in i.value for i in app.info)
    assert button(app,'Approve simulation').disabled
    app.text_area(key='description-INC-1042').set_value('VPN gateway authentication failed for a remote worker').run()
    assert not any(b.label=='Approve simulation' for b in app.button)
    assert 'decision-INC-1042' not in app.session_state
    button(app,'Analyze Ticket').click().run()
    assert not button(app,'Approve simulation').disabled
    app.selectbox(key='status-INC-1042').select('Resolved').run()
    app.text_area(key='note-INC-1042').set_value('Connectivity restored in lab').run()
    assert button(app,'Save to mock connector').disabled
    app.checkbox(key='validated-INC-1042').check().run()
    assert not button(app,'Save to mock connector').disabled
    button(app,'Save to mock connector').click().run()
    assert app.session_state['connector'].get_ticket('INC-1042').status=='Resolved'
    assert not app.exception

def test_switching_ticket_does_not_reuse_analysis():
    app=AppTest.from_file(Path(__file__).resolve().parents[1] / 'app.py',default_timeout=30).run()
    button(app,'Analyze Ticket').click().run()
    app.sidebar.selectbox[0].select('INC-1044').run()
    assert not any(b.label=='Approve simulation' for b in app.button)
    button(app,'Analyze Ticket').click().run()
    button(app,'Reject action').click().run()
    assert any('REJECTED' in i.value for i in app.info)
    assert not app.exception
