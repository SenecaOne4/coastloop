function canPlay4K(info as Object) as Boolean
    videoMode = info.GetVideoMode()
    if Left(videoMode, 5) <> "2160p"
        return false
    end if

    if info.GetModelType() = "STB"
        hdmi = CreateObject("roHdmiStatus")
        if hdmi = invalid or hdmi.IsHdcpActive("2.2") <> true
            return false
        end if
    end if

    decode4k = info.CanDecodeVideo({
        codec: "hevc"
        profile: "main"
        level: "5.1"
    })

    return decode4k <> invalid and decode4k.result = true
end function

function getLanIp() as String
    info = CreateObject("roDeviceInfo")
    addrs = info.GetIPAddrs()
    fallback = ""

    if addrs <> invalid
        for each key in addrs
            ip = addrs[key]

            if ip <> invalid and ip <> "" and Left(ip, 4) <> "127."
                if Left(ip, 8) = "192.168." or Left(ip, 3) = "10."
                    return ip
                end if

                if fallback = ""
                    fallback = ip
                end if
            end if
        end for
    end if

    return fallback
end function

sub init()
    m.baseUrl = "https://coastloop.site"
    m.playerVersion = "roku-0.1.9"
    m.tasks = {}
    m.nextTaskId = 0
    m.retryDelay = 5
    m.proofRetryQueue = []
    m.proofRetryActive = false
    m.configRefreshInFlight = false
    m.configClock = invalid
    m.mediaRetryDelay = 5
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
    m.retryTimer = m.top.findNode("retryTimer")
    m.mediaRetryTimer = m.top.findNode("mediaRetryTimer")
    m.heartbeatTimer = m.top.findNode("heartbeatTimer")
    m.imageTimer = m.top.findNode("imageTimer")

    m.pollTimer.observeField("fire", "onPoll")
    m.retryTimer.observeField("fire", "onProofRetry")
    m.mediaRetryTimer.observeField("fire", "onMediaRetry")
    m.heartbeatTimer.observeField("fire", "onHeartbeat")
    m.imageTimer.observeField("fire", "onImageFinished")
    m.video.observeField("state", "onVideoState")

    info = CreateObject("roDeviceInfo")
    m.deviceId = info.GetChannelClientId()

    display = info.GetDisplaySize()
    m.displayWidth = display.w
    m.displayHeight = display.h
    m.videoMode = info.GetVideoMode()
    m.canPlay4k = canPlay4K(info)

    m.lanIp = getLanIp()

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
        video_mode: m.videoMode
        can_play_4k: m.canPlay4k
        lan_ip: m.lanIp
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

sub requestConfigRefresh()
    if m.deviceKey = invalid or m.deviceKey = "" then return
    if m.configRefreshInFlight = true then return

    m.configRefreshInFlight = true
    m.configClock = CreateObject("roTimespan")
    m.configClock.Mark()

    startRequest("config_refresh", "/api/player/config", {
        device_id: m.deviceId
        device_key: m.deviceKey
    })
end sub

sub maybeRefreshConfig()
    if m.configRefreshInFlight = true then return

    if m.configClock = invalid or m.configClock.TotalMilliseconds() >= 60000
        requestConfigRefresh()
    end if
end sub

sub startRequest(action as String, path as String, body as Object)
    startRequestAttempt(action, path, body, 0)
end sub

sub startRequestAttempt(action as String, path as String, body as Object, retryCount as Integer)
    m.nextTaskId = m.nextTaskId + 1
    requestId = action + "-" + m.nextTaskId.ToStr()

    task = CreateObject("roSGNode", "CoastLoopNetworkTask")
    task.observeField("response", "onNetworkResponse")

    task.request = {
        action: action
        path: path
        url: m.baseUrl + path
        body: body
        retry_count: retryCount
        request_id: requestId
    }

    m.tasks[requestId] = task
    task.control = "RUN"
end sub

sub retireTask(task as Object)
    if task = invalid then return
    req = task.request
    if req = invalid then return
    if req.request_id = invalid or req.request_id = "" then return
    task.unobserveField("response")
    m.tasks.Delete(req.request_id)
end sub

sub resetRetryBackoff()
    m.retryDelay = 5
end sub

sub scheduleRetry()
    m.pollTimer.control = "stop"
    m.pollTimer.duration = m.retryDelay
    m.pollTimer.control = "start"

    m.retryDelay = m.retryDelay * 2
    if m.retryDelay > 60 then m.retryDelay = 60
end sub

sub queueProofRetry(req as Object)
    if req = invalid then return

    retryCount = 0
    if req.retry_count <> invalid then retryCount = req.retry_count
    if retryCount >= 3 then return

    if m.proofRetryQueue.Count() >= 20
        m.proofRetryQueue.Shift()
    end if

    m.proofRetryQueue.Push({
        action: "proof"
        path: req.path
        body: req.body
        retry_count: retryCount + 1
    })

    scheduleProofRetry()
end sub

sub scheduleProofRetry()
    if m.proofRetryActive = true then return
    if m.proofRetryQueue.Count() = 0 then return

    item = m.proofRetryQueue[0]
    delay = 2
    if item.retry_count = 2 then delay = 5
    if item.retry_count >= 3 then delay = 15

    m.proofRetryActive = true
    m.retryTimer.control = "stop"
    m.retryTimer.duration = delay
    m.retryTimer.control = "start"
end sub

sub onProofRetry()
    m.proofRetryActive = false
    if m.proofRetryQueue.Count() = 0 then return

    item = m.proofRetryQueue.Shift()
    startRequestAttempt(item.action, item.path, item.body, item.retry_count)
end sub

sub onNetworkResponse(event as Object)
    task = event.getRoSGNode()
    req = invalid
    if task <> invalid then req = task.request

    result = event.getData()
    retireTask(task)

    action = ""
    if req <> invalid and req.action <> invalid then action = req.action
    if result <> invalid and result.action <> invalid then action = result.action

    if result = invalid or result.ok <> true
        if (action = "config" or action = "config_refresh") and result <> invalid and result.status_code = 401
            m.configRefreshInFlight = false
            clearDeviceKey()
            resetRetryBackoff()
            boot()
            return
        end if

        if action = "proof"
            queueProofRetry(req)
            return
        end if

        if action = "config_refresh"
            m.configRefreshInFlight = false
            m.configClock = invalid
            return
        end if

        if action = "boot" or action = "config"
            m.status.text = "Connection retrying..."
            scheduleRetry()
        end if
        return
    end if

    if action = "boot" or action = "config"
        resetRetryBackoff()
    end if

    if action = "proof"
        scheduleProofRetry()
        return
    end if

    data = result.data

    if action = "boot"
        handleBoot(data)
    else if action = "config"
        handleConfig(data)
    else if action = "config_refresh"
        handleConfigRefresh(data)
    end if
end sub

sub clearDeviceKey()
    m.deviceKey = ""
    reg = CreateObject("roRegistrySection", "CoastLoop")
    reg.Delete("device_key")
    reg.Flush()
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
    m.configRefreshInFlight = false

    if data.items <> invalid and data.items.Count() > 0
        m.items = data.items
        m.index = 0
        m.pairing.visible = false
        m.heartbeatTimer.control = "start"
        m.configClock = CreateObject("roTimespan")
        m.configClock.Mark()
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

sub handleConfigRefresh(data as Object)
    m.configRefreshInFlight = false

    if data.items <> invalid and data.items.Count() > 0
        m.items = data.items
        m.configClock = CreateObject("roTimespan")
        m.configClock.Mark()
    else
        m.configClock = invalid
    end if
end sub

sub schedulePoll()
    resetRetryBackoff()
    m.pollTimer.control = "stop"
    m.pollTimer.duration = 5
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
        m.mediaRetryDelay = 5
        m.mediaRetryTimer.control = "stop"

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

    scheduleMediaRetry()
end sub

sub scheduleMediaRetry()
    m.video.control = "stop"
    m.poster.visible = false

    m.mediaRetryTimer.control = "stop"
    m.mediaRetryTimer.duration = m.mediaRetryDelay
    m.mediaRetryTimer.control = "start"

    m.mediaRetryDelay = m.mediaRetryDelay * 2
    if m.mediaRetryDelay > 60 then m.mediaRetryDelay = 60
end sub

sub onMediaRetry()
    playCurrent()
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

    info = CreateObject("roDeviceInfo")
    proofId = info.GetRandomUUID()

    startRequest("proof", "/api/player/proof", {
        device_id: m.deviceId
        device_key: m.deviceKey
        proof_id: proofId
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
        playCurrent()
        maybeRefreshConfig()
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
        video_mode: m.videoMode
        can_play_4k: m.canPlay4k
        lan_ip: m.lanIp
    })
end sub
