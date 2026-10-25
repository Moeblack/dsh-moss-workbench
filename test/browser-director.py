"""Verify the 3D director in the real DSH GUI using an isolated board."""
import copy
import json
import re
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:3080'
STATE = BASE + '/plugins/dsh-moss-workbench/state'
OUT = Path('/home/moeblack/下载/MOSS提示词实验/出图/moss-workbench-3d-mannequin-ps.png')
urls = re.findall(r'dsh web: (http://\S+)', subprocess.check_output(['journalctl', '--user', '-u', 'dsh-web', '--no-pager'], text=True))
url = urls[-1] if urls else BASE

def box(id, label, x, y, w, h, note, color, **extras):
    return dict(id=id, label=label, points=[dict(x=x,y=y),dict(x=x+w,y=y),dict(x=x+w,y=y+h),dict(x=x,y=y+h)], noteZh=note, color=color, **extras)

scene = dict(canvasWidth=1536, canvasHeight=1024, canvasMode='single', viewportMode='split', strokes=[], meta=[], palette=['#57b4dc','#e87d73','#dab76d'], globalNoteZh='月下决斗：剑锋相接，前后景错位', globalCaption='A moonlit duel. Two swordsfighters confront each other.', camera=dict(enabled=True, liveSync=True, orbit=-10, pitch=-8, roll=-4, distance=1.22, fov=50, pan_x=0, pan_y=0, pan_z=0), items=[
    box('hero','character',260,190,330,700,'女剑士 · 近景突进','#57b4dc',caption='A swordswoman in the foreground.',body=dict(anchor='world',z=1.1,thickness=.35,yaw=65),mannequin=dict(enabled=True,type='Female',preset='weapon',autoFit=True)),
    box('rival','character',850,250,300,610,'黑衣武者 · 纵深防御','#e87d73',caption='A rival swordsman.',body=dict(anchor='world',z=1.7,thickness=.35,yaw=-65),mannequin=dict(enabled=True,type='Male',preset='guard',autoFit=True)),
    box('katana','object',500,410,38,360,'长刀 · 绑定右手','#dab76d',body=dict(anchor='world',z=1.1,thickness=.03,yaw=0,transform=dict(matrix=[.42,-.91,0,.91,.42,0,0,0,1],origin=[0,0,0])),attachment=dict(holderId='hero',joint='r_wrist',offset=[95,-35,0])),
    box('blade','object',900,360,32,300,'短剑 · 绑定左手','#b5a5e8',body=dict(anchor='world',z=1.7,thickness=.03,yaw=0,transform=dict(matrix=[.42,.91,0,-.91,.42,0,0,0,1],origin=[0,0,0])),attachment=dict(holderId='rival',joint='l_wrist',offset=[-90,-35,0])),
])
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':2000,'height':1250},device_scale_factor=1.5)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(url)
    page.wait_for_load_state('networkidle')
    original=page.request.get(STATE).json()
    virtual=dict(state=copy.deepcopy(scene),serverRevision=original['serverRevision']+1,ok=True)
    def route_state(route):
        if route.request.method=='POST':
            payload=route.request.post_data_json
            virtual['state']=payload['state'];virtual['serverRevision']+=1
            if payload.get('snapshotDataUrl'):virtual['snapshotDataUrl']=payload['snapshotDataUrl']
        route.fulfill(status=200,content_type='application/json',body=json.dumps(virtual))
    page.route('**/plugins/dsh-moss-workbench/state',route_state)
    greeting=page.get_by_text('你好',exact=True)
    if greeting.count(): greeting.first.click()
    page.get_by_role('button',name='打开 MOSS 分镜工作台',exact=True).click()
    root=page.locator('.moss-wb-root').last
    expect(root).to_be_visible()
    root.get_by_role('button',name='🎬 3D/2D 双视窗',exact=True).click()
    root.get_by_role('tab',name='🎥 3D与人偶',exact=True).click()
    root.get_by_label('选择体块',exact=True).select_option('hero')
    expect(root.locator('.moss-director-stage canvas')).to_be_visible()
    expect(root.locator('svg.moss-wb-svg')).to_be_visible()
    expect(root.get_by_role('group',name='13 种机位预设')).to_be_visible()
    assert root.get_by_role('group',name='13 种机位预设').get_by_role('button').count()==13
    def saved():return page.evaluate("JSON.parse(localStorage.getItem('dsh-moss-workbench-state-v1')).present")
    before=copy.deepcopy(saved())
    root.get_by_label('环绕数值',exact=True).fill('-16')
    page.wait_for_function("JSON.parse(localStorage.getItem('dsh-moss-workbench-state-v1')).present.camera.orbit === -16")
    after=saved()
    assert after['items'][0]['points'] != before['items'][0]['points'], 'live sync must update bbox points'
    assert after['items'][0]['body'].get('source'), 'live sync must preserve world source'
    root.get_by_role('button',name='双手持武',exact=True).click()
    root.get_by_label('人偶体型',exact=True).select_option('Female')
    assert root.locator('.moss-director-overlay').count() >= 2
    stage=root.locator('.moss-director-stage canvas')
    hits=stage.evaluate('(el)=>el.__directorHit')
    assert len(hits['items'])==4 and len(hits['joints'])>8 and hits['camera'], 'stage must include volumes, joints and frustum camera'
    # Direct joint drag changes a real FK angle, not an English pose string.
    joint=next(j for j in hits['joints'] if j['key']=='r_wrist')
    bb=stage.bounding_box()
    prior=copy.deepcopy(saved()['items'][0]['mannequin'])
    page.mouse.move(bb['x']+joint['x'],bb['y']+joint['y']);page.mouse.down();page.mouse.move(bb['x']+joint['x']+25,bb['y']+joint['y']-18,steps=6);page.mouse.up()
    assert saved()['items'][0]['mannequin'] != prior
    assert saved()['globalCaption']==scene['globalCaption']
    # Restore the clean manga action and show the complete dark studio.
    with page.expect_response(lambda response:response.url==STATE and response.request.method=='POST'):
        root.get_by_role('button',name='双手持武',exact=True).click()
    assert virtual.get('snapshotDataUrl','').startswith('data:image/png;base64,'), 'AI sketch must include the canvas-rendered mannequin PNG'
    sketch=page.evaluate('''async data=>{const im=new Image();im.src=data;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const a=x.getImageData(0,0,c.width,c.height).data;let shaded=0;for(let i=0;i<a.length;i+=4)if(a[i+2]>a[i]+20&&a[i]<170&&a[i+1]>90)shaded++;return {width:c.width,height:c.height,shaded};}''',virtual['snapshotDataUrl'])
    assert sketch['width']==1536 and sketch['height']==1024 and sketch['shaded']>1500, sketch
    root.locator('.moss-wb-panel-content').first.evaluate('(el)=>el.scrollTop=0')
    stage.hover();page.mouse.wheel(0,-250)
    # Hide only the unrelated desktop-pet overlay for the product screenshot.
    page.add_style_tag(content='[class*=pet-container],[class*=PetContainer]{display:none!important}')
    OUT.parent.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(OUT),full_page=True)
    assert not errors, errors
    print(json.dumps(dict(ok=True,screenshot=str(OUT),stageItems=len(hits['items']),joints=len(hits['joints']),errors=errors,liveBBoxChanged=True,captionUnchanged=True),ensure_ascii=False))
    browser.close()
