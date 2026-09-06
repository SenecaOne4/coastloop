sub init()
    m.baseUrl = "https://coastloop.site"
    m.playerVersion = "roku-0.1.3"
    m.tasks = []
    m.items = []
    m.index = 0
    m.currentItem = invalid
    m.fallbackTried = false

    m.pairing = m.top.findNode("pairing")
    m.pairCode = m.top.findNode("pairCode")
    m.status = m.top.findNode("status")
    m.video = m.top.findNode("video")
    m.poster = m.top.findNode("poster")
    m.pollTimer = m.top.findNode("pollTimer")
    m.heartbeatTimer = m.top.findNode("heartbeatTimer")
    m.imageTimer = m.top.findNode("imageTimer")

    m.pollTimer.observeField("fire", "onPoll")
    m.heartbeatTimer.observeField("fire", "onHeartbeat")
    m.imageTimer.observeField("fire", "onImageFinished")
    m.video.observeField("state", "onVideoState")

    info = CreateObject("roDeviceInfo")
    m.deviceId = info.GetChannelClientId()

    display = info.GetDisplaySize()
    m.displayWidth = display.w
    m.displayHeight = display.h

    reg = CreateObject("roRegistrySection", "CoastLoop")
    m.deviceKey = reg.Read("device_key")

    m.top.setFocus(true)
    boot()
end sub

sub boot()
    m.status.text = "Connecting to CoastLoop..."

    body = {
        device_id: m.deviceId
        app_version: m.playerVersion
        width: m.displayWidth
        height: m.displayHeight
    }

    if m.deviceKey <> invalid and m.deviceKey <> ""
        body.device_key = m.deviceKey
    end if

    startRequest("boot", "/api/player/boot", body)
end sub

sub requestConfig()
    if m.deviceKey = invalid or m.deviceKey = ""
        boot()
        return
    end if

    startRequest("config", "/api/player/config", {
        device_id: m.deviceId
        device_key: m.deviceKey
    })
end sub

sub startRequest(action as String, path as String, body as Object)
    task = CreateObject("roSGNode", "CoastLoopNetworkTask")
    task.observeField("response", "onNetworkResponse")

    task.request = {
        action: action
        url: m.baseUrl + path
        body: body
    }

    m.tasks.Push(task)
    task.control = "RUN"
end sub

sub onNetworkResponse(event as Object)
    result = event.getData()

    if result = invalid or result.ok <> true
        m.status.text = "Connection retrying..."
        schedulePoll()
        return
    end if

    action = result.action
    data = result.data

    if action = "boot"
        handleBoot(data)
    else if action = "config"
        handleConfig(data)
    end if
end sub

sub handleBoot(data as Object)
    if data.device_key <> invalid and data.device_key <> ""
        m.deviceKey = data.device_key

        reg = CreateObject("roRegistrySection", "CoastLoop")
        reg.Write("device_key", m.deviceKey)
        reg.Flush()
    end if

    if data.pair_code <> invalid and data.pair_code <> ""
        m.pairCode.text = data.pair_code
        m.status.text = "Enter this code in CoastLoop Admin"
    end if

    requestConfig()
end sub

sub handleConfig(data as Object)
    if data.items <> invalid and data.items.Count() > 0
        m.items = data.items
        m.index = 0
        m.pairing.visible = false
        m.heartbeatTimer.control = "start"
        playCurrent()
    else
        m.pairing.visible = true

        if data.pair_code <> invalid and data.pair_code <> ""
            m.pairCode.text = data.pair_code
        end if

        m.status.text = "Waiting for pairing..."
        schedulePoll()
    end if
end sub

sub schedulePoll()
    m.pollTimer.control = "stop"
    m.pollTimer.control = "start"
end sub

sub onPoll()
    requestConfig()
end sub

sub playCurrent()
    if m.items = invalid or m.items.Count() = 0
        schedulePoll()
        return
    end if

    if m.index >= m.items.Count()
        m.index = 0
        requestConfig()
        return
    end if

    m.currentItem = m.items[m.index]
    m.fallbackTried = false
    playItemUrl(m.currentItem.url)
end sub

function mediaUrl(url as String) as String
    if Left(url, 1) = "/"
        return m.baseUrl + url
    end if
    return url
end function

sub playItemUrl(url as String)
    item = m.currentItem
    if item = invalid then return

    m.currentStarted = false
    m.playClock = invalid
    url = mediaUrl(url)

    mediaType = item.media_type
    if mediaType = invalid then mediaType = item.kind

    if mediaType = "image"
        m.video.visible = false
        m.video.control = "stop"

        m.poster.uri = url
        m.poster.visible = true
        m.currentStarted = true
        m.playClock = CreateObject("roTimespan")
        m.playClock.Mark()

        seconds = item.duration_seconds
        if seconds = invalid or seconds <= 0 then seconds = 15

        m.imageTimer.duration = seconds
        m.imageTimer.control = "start"
    else
        m.poster.visible = false
        m.video.visible = true

        content = CreateObject("roSGNode", "ContentNode")
        content.url = url
        content.streamFormat = "mp4"

        m.video.content = content
        m.video.control = "play"
    end if
end sub

sub onVideoState()
    state = m.video.state

    if state = "playing"
        if m.currentStarted = false
            m.currentStarted = true
            m.playClock = CreateObject("roTimespan")
            m.playClock.Mark()
        end if
    else if state = "finished"
        if m.currentStarted = true
            recordProof()
        end if
        advance()
    else if state = "error"
        tryFallbackOrAdvance()
    end if
end sub

sub onImageFinished()
    recordProof()
    advance()
end sub

sub tryFallbackOrAdvance()
    item = m.currentItem

    if m.fallbackTried = false and item <> invalid and item.fallback_url <> invalid and item.fallback_url <> ""
        m.fallbackTried = true

        if item.fallback_media_id <> invalid
            item.media_id = item.fallback_media_id
        end if

        playItemUrl(item.fallback_url)
        return
    end if

    advance()
end sub

sub recordProof()
    item = m.currentItem
    if item = invalid then return

    seconds = item.duration_seconds
    if seconds = invalid or seconds <= 0 then seconds = 15

    if m.playClock <> invalid
        actual = m.playClock.TotalMilliseconds() / 1000.0
        if actual > 0 then seconds = actual
    end if

    campaignId = invalid
    if item.campaign_id <> invalid then campaignId = item.campaign_id

    startRequest("proof", "/api/player/proof", {
        device_id: m.deviceId
        device_key: m.deviceKey
        media_id: item.media_id
        campaign_id: campaignId
        seconds: seconds
    })
end sub

sub advance()
    m.video.control = "stop"
    m.poster.visible = false

    m.index = m.index + 1

    if m.index >= m.items.Count()
        m.index = 0
        requestConfig()
    else
        playCurrent()
    end if
end sub

sub onHeartbeat()
    if m.deviceKey = invalid or m.deviceKey = "" then return

    startRequest("heartbeat", "/api/player/heartbeat", {
        device_id: m.deviceId
        device_key: m.deviceKey
        app_version: m.playerVersion
        width: m.displayWidth
        height: m.displayHeight
    })
end sub
