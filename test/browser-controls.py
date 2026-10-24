"""Live-GUI regression check; all UI edits use an isolated state endpoint.
Does not mutate the user's live board. Run with ../.venv-shot/bin/python
from the plugin root.
"""
import copy
import json
import os
import re
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:3080'
STATE = BASE + '/plugins/dsh-moss-workbench/state'
OUT = Path(os.environ.get('MOSS_WB_SCREENSHOT_OUT', '/tmp/moss-workbench-ps-layout.png'))
urls = re.findall(r'dsh web: (http://\S+)', subprocess.check_output(
    ['journalctl', '--user', '-u', 'dsh-web', '--no-pager'], text=True))
url = os.environ.get('DSH_TEST_WEB_URL') or (urls[-1] if urls else BASE)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1600, 'height': 1000})
    page_errors, console_errors, failed_resources = [], [], []
    page.on('pageerror', lambda error: page_errors.append(str(error)))
    page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
    page.on('response', lambda response: failed_resources.append({'status': response.status, 'url': response.url}) if response.status >= 400 else None)
    page.goto(url)
    original = page.request.get(STATE).json()
    state = copy.deepcopy(original['state'])
    virtual = {'state': state, 'serverRevision': original['serverRevision'], 'ok': True}

    # Read-only observation of the real compiler; never overwrite concurrent edits.
    backend_palette_empty = original['compiled']['mossJson']['summary']['palette'] == [] if state.get('palette') == [] else None

    # Prevent test edits and generated snapshots from changing the user's board.
    def state_route(route):
        if route.request.method == 'POST':
            payload = route.request.post_data_json
            virtual['state'] = payload['state']
            virtual['serverRevision'] += 1
        route.fulfill(status=200, content_type='application/json', body=json.dumps(virtual))
    page.route('**/plugins/dsh-moss-workbench/state', state_route)
    page.get_by_text('你好', exact=True).first.click()
    baseline_console = list(console_errors)
    console_errors.clear()
    page.get_by_role('tab', name='MOSS 分镜台', exact=True).click()
    root = page.locator('.wSkVaW_viewArea .moss-wb-root')
    expect(root).to_be_visible()
    expect(root.get_by_role('form', name='画布比例与像素')).to_be_visible()
    expect(root.get_by_label('总像素（百万像素 MP）')).not_to_have_value('')

    def saved():
        return page.evaluate("JSON.parse(localStorage.getItem('dsh-moss-workbench-state-v1')).present")
    def json_output():
        root.get_by_role('tab', name='MOSS JSON', exact=True).click()
        return json.loads(root.get_by_label('实时 MOSS JSON').inner_text())
    def apply_and_expect(w, h):
        root.get_by_role('button', name='应用尺寸', exact=True).click()
        expect(root.locator('svg.moss-wb-svg')).to_have_attribute('viewBox', f'0 0 {w} {h}')

    assert root.get_by_label('画布分辨率', exact=True).count() == 0
    assert root.get_by_label('载入起手模板', exact=True).count() == 0
    initial = saved()
    ratio = root.get_by_role('combobox', name='画布比例', exact=True)
    expect(ratio.locator('option')).to_have_count(14)
    root.get_by_label('总像素（百万像素 MP）').fill('1.5')
    ratio.select_option('3:2')
    expect(root.locator('svg.moss-wb-svg')).to_have_attribute('viewBox', '0 0 1504 992')
    resized = saved()
    assert len(resized['items']) == len(initial['items'])
    for before, after in zip(initial['items'], resized['items']):
        for a, b in zip(before['points'], after['points']):
            assert abs(a['x'] / initial['canvasWidth'] * 1504 - b['x']) <= .5
            assert abs(a['y'] / initial['canvasHeight'] * 992 - b['y']) <= .5
    root.get_by_role('button', name='↶ 撤销', exact=True).click()
    expect(root.locator('svg.moss-wb-svg')).to_have_attribute('viewBox', f"0 0 {initial['canvasWidth']} {initial['canvasHeight']}")

    for preset, inverse, w, h in [('4:3', '3:4', 1152, 864), ('9:19.5', '19.5:9', 672, 1472), ('21:9', '9:21', 1536, 640), ('2:1', '1:2', 1408, 704)]:
        root.get_by_label('总像素（百万像素 MP）').fill('1')
        ratio.select_option(preset)
        expect(root.locator('svg.moss-wb-svg')).to_have_attribute('viewBox', f'0 0 {w} {h}')
        expect(ratio).to_have_value(preset)
        expect(root.get_by_label('自定义比例宽', exact=True)).to_have_count(0)
        root.get_by_role('button', name='横竖互换', exact=True).click()
        expect(root.locator('svg.moss-wb-svg')).to_have_attribute('viewBox', f'0 0 {h} {w}')
        expect(ratio).to_have_value(inverse)
    before_unscaled = copy.deepcopy(saved()['items'])
    root.get_by_role('button', name='自动适配框', exact=True).click()
    # Grow both axes: disabling scale still clamps geometry on a smaller canvas.
    root.get_by_label('总像素（百万像素 MP）').fill('3')
    ratio.select_option('4:3')
    assert saved()['items'] == before_unscaled
    root.get_by_role('button', name='自动适配框', exact=True).click()
    ratio.select_option('custom')
    expect(root.get_by_label('自定义比例宽', exact=True)).to_be_visible()
    root.get_by_label('自定义比例宽', exact=True).fill('16')
    root.get_by_label('自定义比例高', exact=True).fill('9')
    root.get_by_label('总像素（百万像素 MP）').fill('1')
    apply_and_expect(1344, 736)
    good_state = saved()
    root.get_by_label('自定义比例宽', exact=True).fill('0')
    expect(root.get_by_role('button', name='应用尺寸', exact=True)).to_be_disabled()
    assert saved() == good_state
    root.get_by_label('自定义比例宽', exact=True).fill('16')
    root.get_by_label('总像素（百万像素 MP）').fill('1000')
    expect(root.get_by_role('button', name='应用尺寸', exact=True)).to_be_disabled()
    assert saved() == good_state
    root.get_by_label('总像素（百万像素 MP）').fill('1')

    root.get_by_role('tab', name='风格与色板', exact=True).click()
    clear = root.get_by_role('button', name='清空配色', exact=True)
    clear.scroll_into_view_if_needed()
    if len(saved()['palette']):
        root.get_by_role('button', name='删除配色 1', exact=True).click()
        assert len(saved()['palette']) == max(0, len(initial['palette']) - 1)
    if len(saved()['palette']):
        clear.click()
    assert saved()['palette'] == []
    assert json_output()['summary']['palette'] == []
    root.get_by_role('button', name='＋ 添加颜色', exact=True).click()
    assert len(saved()['palette']) == 1
    root.get_by_role('button', name='删除配色 1', exact=True).click()
    assert saved()['palette'] == []
    root.get_by_role('button', name='↶ 撤销', exact=True).click()
    assert len(saved()['palette']) == 1
    root.get_by_role('button', name='↷ 重做', exact=True).click()
    assert saved()['palette'] == []
    assert json_output()['summary']['palette'] == []

    # Wait for the actual client sync request to the isolated endpoint.
    page.wait_for_function("JSON.parse(localStorage.getItem('dsh-moss-workbench-state-v1')).present.palette.length === 0")
    with page.expect_request(lambda request: request.url == STATE and request.method == 'POST'):
        root.get_by_label('全局英文 caption（可选）').fill(initial.get('globalCaption', '') + ' ')
    root.get_by_label('全局英文 caption（可选）').fill(initial.get('globalCaption', ''))
    page.reload()
    expect(root).to_be_visible()
    expect(root.get_by_label('总像素（百万像素 MP）')).to_have_value('1')
    expect(ratio).to_have_value('16:9')
    expect(root.get_by_label('自定义比例宽', exact=True)).to_have_count(0)
    assert saved()['palette'] == []
    assert json_output()['summary']['palette'] == []

    # Optional tags remain arbitrary, removable, and do not resurrect defaults.
    root.get_by_role('tab', name='风格与色板', exact=True).click()
    tag_input = root.get_by_label('风格标签（可选，自由填写）', exact=True)
    tag_input.fill('my_custom_style')
    root.get_by_role('button', name='添加标签', exact=True).click()
    assert 'my_custom_style' in saved()['meta']
    for tag in list(saved()['meta']):
        root.get_by_role('button', name=f'删除风格标签 {tag}', exact=True).click()
    assert json_output()['summary']['meta'] == []
    # PS file actions: explicit save, lossless new, immediate AI sync, tab return.
    def documents():
        return page.evaluate("JSON.parse(localStorage.getItem('dsh-moss-workbench-docs-v1'))")
    doc_tabs = root.locator('.moss-wb-document-tabs [role=tab]')
    expect(doc_tabs).to_have_count(1)
    root.get_by_role('button', name='保存文件', exact=True).click()
    expect(root.get_by_role('button', name='保存文件', exact=True)).to_have_text('✓ 已保存')
    expect(root.locator('.moss-wb-document-dirty')).to_have_count(0)
    first_id = documents()['activeId']
    before_new = saved()
    with page.expect_request(lambda request: request.url == STATE and request.method == 'POST' and request.post_data_json['state']['items'] == []):
        root.get_by_role('button', name='新建文件', exact=True).click()
    expect(doc_tabs).to_have_count(2)
    assert saved()['items'] == [] and saved()['palette'] == [] and saved()['meta'] == []
    assert len(documents()['documents'][0]['state']['items']) == len(initial['items'])
    expect(doc_tabs.nth(1)).to_have_attribute('aria-selected', 'true')
    assert virtual['state']['items'] == []
    # Rename supports Enter; Escape cancels without changing the persisted title.
    doc_tabs.nth(1).dblclick()
    root.get_by_label('文档名称', exact=True).fill('重命名测试')
    root.get_by_label('文档名称', exact=True).press('Enter')
    expect(doc_tabs.nth(1)).to_have_attribute('aria-label', '文档 重命名测试')
    doc_tabs.nth(1).dblclick()
    root.get_by_label('文档名称', exact=True).fill('取消名称')
    root.get_by_label('文档名称', exact=True).press('Escape')
    expect(doc_tabs.nth(1)).to_have_attribute('aria-label', '文档 重命名测试')
    doc_tabs.nth(1).dblclick()
    root.get_by_label('文档名称', exact=True).fill('未命名-2')
    root.get_by_label('文档名称', exact=True).press('Enter')
    with page.expect_request(lambda request: request.url == STATE and request.method == 'POST' and len(request.post_data_json['state']['items']) == len(initial['items'])):
        doc_tabs.nth(0).click()
    assert documents()['activeId'] == first_id
    assert saved() == before_new
    assert len(virtual['state']['items']) == len(initial['items'])
    # Dirty marker and shortcut save; then export a real local JSON download.
    root.get_by_label('全局画面简述', exact=True).fill('文件测试修改')
    expect(root.locator('.moss-wb-document-dirty')).to_have_count(1)
    root.focus()
    page.keyboard.press('Control+s')
    expect(root.locator('.moss-wb-document-dirty')).to_have_count(0)
    expected_export = json_output()
    with page.expect_download() as download_info:
        root.get_by_role('button', name='导出文件', exact=True).click()
    download = download_info.value
    assert download.suggested_filename.endswith('.moss.json')
    assert json.loads(Path(download.path()).read_text()) == expected_export
    assert len(documents()['documents'][0]['state']['items']) == len(initial['items'])
    root.get_by_label('全局画面简述', exact=True).fill(before_new.get('globalNoteZh', ''))
    root.focus()
    page.keyboard.press('Alt+n')
    expect(doc_tabs).to_have_count(3)
    # Permanent deletion is named and confirmed, never a silent accidental loss.
    page.once('dialog', lambda dialog: dialog.dismiss())
    root.get_by_role('button', name='关闭并删除文档 未命名-3', exact=True).click()
    expect(doc_tabs).to_have_count(3)
    page.once('dialog', lambda dialog: dialog.accept())
    root.get_by_role('button', name='关闭并删除文档 未命名-3', exact=True).click()
    expect(doc_tabs).to_have_count(2)
    doc_tabs.nth(0).click()
    assert len(saved()['items']) == len(initial['items'])
    page.reload()
    expect(root).to_be_visible()
    expect(doc_tabs).to_have_count(2)
    expect(doc_tabs.nth(0)).to_have_attribute('aria-selected', 'true')
    assert len(saved()['items']) == len(initial['items'])

    measurements = []
    for width, height in [(1600, 1000), (1024, 768), (800, 900), (1600, 1000)]:
        page.set_viewport_size({'width': width, 'height': height})
        expect(root.get_by_role('button', name='应用尺寸', exact=True)).to_be_visible()
        measurements.append({'viewport': [width, height], 'root': root.bounding_box(), 'overflow': root.evaluate('(el) => el.scrollWidth > el.clientWidth')})
        assert not measurements[-1]['overflow']

    # Check contextual options and direct (not force-clicked) SVG tool buttons.
    root.get_by_role('button', name='分镜刀工具', exact=True).click()
    expect(root.get_by_label('分镜沟槽宽度', exact=True)).to_be_visible()
    root.get_by_role('button', name='横切 0°', exact=True).click()
    assert len(saved()['items']) > len(initial['items'])
    root.get_by_role('button', name='↶ 撤销', exact=True).click()
    assert len(saved()['items']) == len(initial['items'])
    root.get_by_role('button', name='气泡工具', exact=True).click()
    expect(root.get_by_role('button', name='心声', exact=True)).to_be_visible()
    root.get_by_role('button', name='涂鸦工具', exact=True).click()
    expect(root.get_by_label('画笔宽度', exact=True)).to_be_visible()
    root.get_by_role('button', name='选择工具', exact=True).click()
    root.get_by_role('tab', name='当前选中框', exact=True).focus()
    page.keyboard.press('ArrowRight')
    expect(root.get_by_role('tab', name='风格与色板', exact=True)).to_have_attribute('aria-selected', 'true')
    root.get_by_role('button', name='导入', exact=True).click()
    expect(root.get_by_role('dialog', name='导入 MOSS JSON', exact=True)).to_be_visible()
    page.keyboard.press('Escape')
    expect(root.get_by_role('dialog', name='导入 MOSS JSON', exact=True)).to_have_count(0)

    # User may keep drawing during tests. Screenshot the latest real state, read-only.
    display_state = page.request.get(STATE).json()['state']
    virtual['state'] = copy.deepcopy(display_state)
    virtual['serverRevision'] += 10
    page.reload()
    expect(root).to_be_visible()
    expect(root.locator('svg.moss-wb-svg')).to_have_attribute('viewBox', f"0 0 {display_state['canvasWidth']} {display_state['canvasHeight']}")
    root.get_by_label('第 1 个框的中文简述', exact=True).click()
    expect(root.get_by_role('tab', name='当前选中框', exact=True)).to_have_attribute('aria-selected', 'true')
    options_height = root.locator('.moss-wb-options-bar').bounding_box()['height']
    stage_height = root.locator('.moss-wb-canvas-stage').bounding_box()['height']
    assert options_height == 42
    assert root.locator('.moss-wb-document-bar').bounding_box()['height'] == 28
    assert stage_height / root.bounding_box()['height'] >= .80
    root.get_by_role('button', name='保存文件', exact=True).click()
    expect(doc_tabs).to_have_count(2)
    expect(doc_tabs.nth(0)).to_have_attribute('aria-selected', 'true')
    expect(root.locator('.moss-wb-document-dirty')).to_have_count(0)
    assert root.locator('.moss-wb-actions').count() == 0
    assert root.locator('.moss-wb-tool-dock').bounding_box()['width'] == 46
    page.screenshot(path=str(OUT), full_page=True)
    report = {'backendPaletteEmpty': backend_palette_empty, 'uiTestsPassed': True,
              'initialItems': len(initial['items']), 'screenshotItems': len(display_state['items']), 'screenshotSize': [display_state['canvasWidth'], display_state['canvasHeight']], 'ratioDropdownOptions': 14, 'pageErrors': page_errors,
              'consoleErrorsAfterMossOpen': console_errors, 'baselineConsoleCount': len(baseline_console),
              'failedResources': failed_resources, 'measurements': measurements, 'screenshot': str(OUT)}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    assert not page_errors
    assert not [message for message in console_errors if 'Failed to load resource:' not in message]
    browser.close()
