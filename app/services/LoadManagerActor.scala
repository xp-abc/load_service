package services

import akka.actor._
import scala.concurrent.duration._
import play.api.libs.concurrent.Execution.Implicits.defaultContext
import akka.util.Timeout

import model.LoadSpec
import LoadSessionActor._
import play.api.libs.ws._

object LoadManagerActor {
  def props(ws:WSClient) = Props[LoadManagerActor](new LoadManagerActor(ws))

  case class ListLoadResources()
  case class GetLoadResource(index: String)
  case class CreateLoadReource(loadSpec: LoadSpec)
  case class UpdateLoadResource(index: String, loadSpec: LoadSpec)
  case class DeleteLoadResource(index: String)

  case class ListLoadSessions()
  case class StartLoadSession(name: String)
  case class EndLoadSession(name: String)
}

class LoadManagerActor(val ws: WSClient) extends Actor {
  import LoadManagerActor._


  var loadResources: Map[String, LoadSpec] = Map()
  
  var index:Integer = 0
  

  def receive = {
    case StartLoadSession(name) => 
       val result = loadResources.get(name) match {
        case None => 404
        case Some(r) =>
          if(r.status.getOrElse("Inactive") == "Inactive") {
            println(name + " has no session " + loadResources)
            val session = context.actorOf(LoadSessionActor.props(name,r,ws), "load-session-" + name)         
            loadResources = loadResources + (name -> r.copy(status = Some("Active")))
            session ! StartSession
            println("LoadManagerActor: Session started")
          }
          200 
      }
      sender ! result
    case EndLoadSession(name) => 
       val rs = for(
         r <- loadResources.get(name);  
         s <- context.child("load-session-" + name)
       ) yield (r,s) 
       
       val result = rs match {
         case None => 404
         case Some((r,s)) => 
           s ! EndSession
           loadResources = loadResources + (name -> r.copy(status = Some("Inactive")))
           println("LoadManagerActor: Session stoped")
           sender ! 200
       }
    case ListLoadResources =>
      sender ! loadResources.keys
    case CreateLoadReource(loadSpec) =>
      loadResources = loadResources + ((index+"") -> loadSpec.copy(status = Some("Inactive")))
      index = index + 1
      sender ! loadSpec
    case UpdateLoadResource(name, loadSpec) =>
      loadResources.get(name) match {
        case None => 
          sender ! 404
        case Some(r) => 
          var updatedResource = loadSpec.copy(status = r.status)
          loadResources = loadResources + (name -> updatedResource)
          sender ! updatedResource
        }
    case DeleteLoadResource(name) =>
      loadResources = loadResources - name
      context.child("load-session-" + name) match {
        case None => 
        case Some(a) => 
          a ! EndSession
      }
      sender ! "Ok"
    case GetLoadResource(name) =>
      sender ! loadResources.get(name)

  }

}